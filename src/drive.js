require('dotenv').config();
const fs = require('fs');
const { google } = require('googleapis');
const { getAuthClient } = require('./auth');

/**
 * Requires these in your .env:
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *   GOOGLE_OAUTH_REFRESH_TOKEN   - generated once via get-refresh-token.js
 *   GOOGLE_DRIVE_FOLDER_ID       - the root "Invoices" folder in your Drive
 *
 * Folder structure created automatically:
 *   Invoices (root, from GOOGLE_DRIVE_FOLDER_ID)
 *     └── 2026
 *           └── 08
 *                 └── INV-2026-08-0001.pdf
 *
 * OAuth client logic now lives in ./auth.js, shared with the MCP server tools.
 */

function getRootFolderId() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID in .env.');
  }
  return folderId;
}

/**
 * Finds a subfolder by name inside a parent folder, or creates it if
 * it doesn't exist yet. Returns the folder ID either way.
 */
async function findOrCreateFolder(drive, name, parentId) {
  const query = `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({ q: query, fields: 'files(id, name)' });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  return created.data.id;
}

/**
 * Uploads a PDF to Drive, auto-creating Invoices/{year}/{month}/ subfolders
 * as needed. Returns the uploaded file's Drive ID and shareable link.
 */
async function uploadInvoicePdf({ filePath, invoiceNumber, date = new Date() }) {
  const auth = getAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const rootFolderId = getRootFolderId();
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');

  const yearFolderId = await findOrCreateFolder(drive, year, rootFolderId);
  const monthFolderId = await findOrCreateFolder(drive, month, yearFolderId);

  const fileName = `${invoiceNumber}.pdf`;

  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [monthFolderId],
    },
    media: {
      mimeType: 'application/pdf',
      body: fs.createReadStream(filePath),
    },
    fields: 'id, webViewLink',
  });

  return {
    fileId: uploaded.data.id,
    link: uploaded.data.webViewLink,
  };
}

module.exports = { uploadInvoicePdf };
