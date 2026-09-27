const { getSheetsClient, getDriveClient } = require('../src/auth');

/**
 * These mirror the same underlying Drive/Sheets calls already used
 * elsewhere in this project (src/sheetsTools.js, src/mcpDriveTools.js) -
 * just redefined in the Anthropic Messages API's tool format (JSON Schema)
 * instead of the MCP SDK's zod-based format, since this is a separate,
 * direct API integration, not going through the MCP connector.
 */

const agentToolDefinitions = [
  {
    name: 'list_drop_folder',
    description: 'List all files currently sitting in the DROP FOLDER, waiting to be filed.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_sheet_range',
    description: 'Read cell values from a Google Sheet - use to check existing logs before filing.',
    input_schema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string' },
        range: { type: 'string', description: "A1 notation, e.g. 'Purchase Log!A1:P50'" },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'search_drive_files',
    description: "Search Drive using Google's query syntax - use to find existing folders or check for duplicate filings.",
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'get_customer_supplier_names',
    description: 'Get the full list of known customer and supplier names, to check whether a document mentions a real business partner or is junk.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_folder_map',
    description: 'Get the exact Drive folder ID for every document nature code (SAL, OR, SINV, PO, PV, SL, TAX, FWD, MISC, BIL, DO, EXP). ALWAYS call this before filing a recognized document - never guess a destination folder or rely on searching by name.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'identify_sender',
    description: "Look up a Telegram sender's numeric ID against the registered Customer list's Telegram Chat ID column. Returns the matching customer name if known, or null if this ID has never been registered. ALWAYS call this first for any order-like message, before relying on a name mentioned in the text.",
    input_schema: {
      type: 'object',
      properties: { telegramId: { type: 'string' } },
      required: ['telegramId'],
    },
  },
  {
    name: 'move_and_rename_file',
    description: 'Move a file to a new destination folder and give it a new name, in one action. This is the actual filing action - use it once you are confident about nature/TRX/destination.',
    input_schema: {
      type: 'object',
      properties: {
        fileId: { type: 'string' },
        newName: { type: 'string' },
        destinationFolderId: { type: 'string' },
      },
      required: ['fileId', 'newName', 'destinationFolderId'],
    },
  },
  {
    name: 'propose_new_trx',
    description:
      'Use this INSTEAD of move_and_rename_file when a document is a genuinely new deal with no existing TRX match. Saves a pending proposal and tells Liau the proposed next number, so he can reply with a simple yes/no/correction rather than looking anything up. Does NOT move the file yet - that only happens once Liau confirms.',
    input_schema: {
      type: 'object',
      properties: {
        chatId: { type: 'string' },
        fileId: { type: 'string' },
        proposedTrx: { type: 'string', description: 'e.g. "TRX20260008" - your best guess at the next available number' },
        filenameSuffix: { type: 'string', description: 'Everything after "TRX{number}-", e.g. "PO090008-USD1200.00.pdf"' },
        destinationFolderId: { type: 'string' },
        summary: { type: 'string', description: 'Brief description of the document, for Liau to recognize it later' },
      },
      required: ['chatId', 'fileId', 'proposedTrx', 'filenameSuffix', 'destinationFolderId', 'summary'],
    },
  },
];

async function listDropFolder({ dropFolderId }) {
  const drive = getDriveClient();
  const res = await drive.files.list({
    q: `'${dropFolderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, createdTime)',
  });
  return res.data.files || [];
}

async function readSheetRange({ spreadsheetId, range }) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}

async function searchDriveFiles({ query }) {
  const drive = getDriveClient();
  const res = await drive.files.list({ q: query, fields: 'files(id, name, mimeType, parents)' });
  return res.data.files || [];
}

// Fixed spreadsheet ID for the Customer & Supplier Info sheet (Company Bespoke).
// If this ever moves, update this one constant rather than hunting through tools.
const CUSTOMER_SUPPLIER_SHEET_ID = '1kfB4W8j2drqYoyqVk9Kj8qkJPUree-SKKtZLPW88E0M';

async function getCustomerSupplierNames() {
  const sheets = getSheetsClient();
  const [customers, suppliers] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: CUSTOMER_SUPPLIER_SHEET_ID, range: 'Customer!A2:A' }),
    sheets.spreadsheets.values.get({ spreadsheetId: CUSTOMER_SUPPLIER_SHEET_ID, range: 'Supplier!A2:A' }),
  ]);
  const customerNames = (customers.data.values || []).map((row) => row[0]).filter(Boolean);
  const supplierNames = (suppliers.data.values || []).map((row) => row[0]).filter(Boolean);
  return { customers: customerNames, suppliers: supplierNames };
}

// Column D of the Customer tab: "Telegram Chat ID" - a fixed, manually
// registered mapping (Liau adds it once per customer), not something the
// AI infers. Deliberately a separate lookup from getCustomerSupplierNames
// so a missing/blank column there doesn't break the name-only check.
async function identifySender({ telegramId }) {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CUSTOMER_SUPPLIER_SHEET_ID,
    range: 'Customer!A2:D',
  });
  const rows = res.data.values || [];
  const match = rows.find((row) => row[3] && String(row[3]).trim() === String(telegramId).trim());
  return { customerName: match ? match[0] : null };
}

async function moveAndRenameFile({ fileId, newName, destinationFolderId }) {
  const drive = getDriveClient();
  const file = await drive.files.get({ fileId, fields: 'parents' });
  const previousParents = (file.data.parents || []).join(',');
  const updated = await drive.files.update({
    fileId,
    addParents: destinationFolderId,
    removeParents: previousParents,
    requestBody: { name: newName },
    fields: 'id, name, parents',
  });
  return updated.data;
}

async function proposeNewTrx({ chatId, fileId, proposedTrx, filenameSuffix, destinationFolderId, summary }) {
  const { savePendingConfirmation } = require('./pendingConfirmations');
  await savePendingConfirmation({ chatId, fileId, proposedTrx, filenameSuffix, destinationFolderId, summary });
  return {
    saved: true,
    note: 'Proposal saved. Tell Liau to reply YES to confirm, NO if wrong, or type the correct TRX number - a plain reply resolves this without needing you again.',
  };
}

// The real "URL for Bot" folder map sheet - the actual source of truth
// for where every document type lives. Read live (not hardcoded) so it
// always reflects the current real structure, even if folders get
// reorganized later.
const FOLDER_MAP_SHEET_ID = '1-3XDkbbCgSLc1EjZEaj2IcN6d8lAQtJTGtEfjTFKM5g';

async function getFolderMap() {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: FOLDER_MAP_SHEET_ID,
    range: 'Sheet1!A2:D',
  });
  const rows = res.data.values || [];
  return rows
    .filter((row) => row[0] && row[0] !== '-') // skip the header-only/unlabeled rows
    .map((row) => ({
      natureCode: row[0],
      folderName: row[1],
      folderId: row[2],
      purpose: row[3],
    }));
}

/**
 * Executes a tool call by name. Called from the brain's tool-use loop.
 */
async function executeAgentTool(name, input) {
  switch (name) {
    case 'list_drop_folder':
      return listDropFolder({ dropFolderId: process.env.DROP_FOLDER_ID });
    case 'read_sheet_range':
      return readSheetRange(input);
    case 'search_drive_files':
      return searchDriveFiles(input);
    case 'get_customer_supplier_names':
      return getCustomerSupplierNames();
    case 'get_folder_map':
      return getFolderMap();
    case 'identify_sender':
      return identifySender(input);
    case 'move_and_rename_file':
      return moveAndRenameFile(input);
    case 'propose_new_trx':
      return proposeNewTrx(input);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = { agentToolDefinitions, executeAgentTool };
