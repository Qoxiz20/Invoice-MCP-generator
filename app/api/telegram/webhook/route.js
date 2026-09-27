import { getDriveClient } from '../../../../src/auth';
import { askBrain, askBrainWithFile } from '../../../../lib/brain';
import { getPendingConfirmation, clearPendingConfirmation } from '../../../../lib/pendingConfirmations';

/**
 * POST /api/telegram/webhook
 *
 * Text messages go through the brain, which checks the sender's Telegram
 * ID against the registered customer list first (a fixed lookup, not
 * inferred), then either answers a question, processes a trusted
 * customer's order (auto-issuing an invoice), or asks who's messaging if
 * neither the ID nor the text identifies them.
 *
 * Files (PDF/photo) get uploaded to DROP FOLDER first (so there's a real
 * Drive file to work with), then immediately handed to the brain WITH its
 * actual content for classification. If it recognizes a known customer/
 * supplier, it moves + renames the file into the correct destination
 * folder automatically - no confirmation step, since Liau reconciles
 * everything with a human once a month regardless. If it doesn't
 * recognize anything, the file moves to the "Unrecognized - check me"
 * folder instead of being silently discarded or left ambiguous in the
 * drop folder.
 *
 * One-time setup after deploying:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-app.vercel.app/api/telegram/webhook"
 */

async function downloadTelegramFile(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const fileInfo = await fileInfoRes.json();
  if (!fileInfo.ok) throw new Error(`getFile failed: ${JSON.stringify(fileInfo)}`);

  const filePath = fileInfo.result.file_path;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadToDropFolder(buffer, fileName, mimeType) {
  const drive = getDriveClient();
  const uploaded = await drive.files.create({
    requestBody: { name: fileName, parents: [process.env.DROP_FOLDER_ID] },
    media: { mimeType, body: bufferToStream(buffer) },
    fields: 'id, webViewLink',
  });
  return uploaded.data;
}

// googleapis expects a Node stream for media.body, not a raw Buffer
function bufferToStream(buffer) {
  const { Readable } = require('stream');
  return Readable.from(buffer);
}

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

/**
 * Resolves a plain yes/no/correction reply to a pending TRX proposal -
 * entirely deterministic, no AI call. Returns true if it handled the
 * message (caller should stop here), false if the text didn't look like
 * a confirmation reply at all (caller should fall through to the brain).
 */
async function tryResolvePendingConfirmation(pending, text, chatId) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const trxMatch = trimmed.match(/TRX\d{8,}/i);

  let finalTrx = null;
  if (lower === 'yes' || lower === 'y') {
    finalTrx = pending.proposed_trx;
  } else if (trxMatch) {
    finalTrx = trxMatch[0].toUpperCase();
  } else if (lower === 'no' || lower === 'n') {
    await sendTelegramMessage(chatId, `Ok - what's the correct TRX number for "${pending.summary}"?`);
    return true; // handled - leave the pending row as-is, waiting for their number next
  } else {
    return false; // doesn't look like a reply to the pending confirmation at all
  }

  const finalName = `${finalTrx}-${pending.filename_suffix}`;
  const drive = getDriveClient();
  const file = await drive.files.get({ fileId: pending.file_id, fields: 'parents' });
  const previousParents = (file.data.parents || []).join(',');
  await drive.files.update({
    fileId: pending.file_id,
    addParents: pending.destination_folder_id,
    removeParents: previousParents,
    requestBody: { name: finalName },
  });
  await clearPendingConfirmation(chatId);
  await sendTelegramMessage(chatId, `Filed as ${finalName}. (${pending.summary})`);
  return true;
}

export async function POST(request) {
  const update = await request.json();
  const message = update.message;

  if (!message) {
    // Telegram sends other update types too (edited messages, etc.) - just ack them
    return Response.json({ ok: true });
  }

  const chatId = message.chat.id;

  try {
    const doc = message.document;
    const photo = message.photo ? message.photo[message.photo.length - 1] : null; // largest size
    const text = message.text;

    if (!doc && !photo && text) {
      // Check for a pending TRX confirmation FIRST - resolving a plain
      // yes/no/correction is cheap deterministic code, no AI call needed
      // at all. Only falls through to the brain if this doesn't look
      // like a reply to a pending proposal.
      const pending = await getPendingConfirmation(chatId);
      if (pending) {
        const resolved = await tryResolvePendingConfirmation(pending, text, chatId);
        if (resolved) return Response.json({ ok: true });
        // else: didn't look like a confirmation reply - fall through to normal handling below
      }

      // Real text - route it through the brain. The brain can both
      // investigate read-only AND process/issue orders (for registered,
      // trusted customers only) - see rulebook.js for exactly what it's
      // allowed to decide vs. what it must always look up.
      await sendTelegramMessage(chatId, 'On it - give me a moment to look...');
      const answer = await askBrain(text, message.from.id);
      await sendTelegramMessage(chatId, answer);
      return Response.json({ ok: true });
    }

    if (!doc && !photo) {
      await sendTelegramMessage(chatId, "Send me a PDF or photo, or just tell me what you need.");
      return Response.json({ ok: true });
    }

    const fileId = doc ? doc.file_id : photo.file_id;
    const fileName = doc ? doc.file_name || `telegram-${fileId}.pdf` : `telegram-photo-${fileId}.jpg`;
    const mimeType = doc ? doc.mime_type || 'application/pdf' : 'image/jpeg';

    const buffer = await downloadTelegramFile(fileId);
    const driveFile = await uploadToDropFolder(buffer, fileName, mimeType);

    await sendTelegramMessage(chatId, `Got "${fileName}" - reading it now...`);

    const result = await askBrainWithFile(buffer, mimeType, driveFile.id, fileName, chatId);

    await sendTelegramMessage(chatId, result);

    return Response.json({ ok: true });
  } catch (err) {
    console.error('Telegram webhook error:', err);
    try {
      await sendTelegramMessage(chatId, `Something went wrong saving that file: ${err.message}`);
    } catch (_) {
      // best-effort notification only
    }
    // Always 200 to Telegram, or it will retry aggressively
    return Response.json({ ok: true });
  }
}
