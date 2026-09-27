require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

/**
 * Requires this SQL run once in your Supabase project (same project
 * already used for the invoice counter):
 *
 *   create table pending_confirmations (
 *     chat_id text primary key,
 *     file_id text not null,
 *     proposed_trx text not null,
 *     filename_suffix text not null,
 *     destination_folder_id text not null,
 *     summary text,
 *     created_at timestamptz default now()
 *   );
 *
 * One row per chat - a new proposal overwrites any older pending one for
 * that chat, so you're never confirming something stale by accident.
 *
 * filename_suffix is everything AFTER "TRX{number}-" (e.g.
 * "PO090008-USD1200.00.pdf") - stored separately from the proposed TRX
 * so that if you reply with a corrected TRX number instead of "yes", the
 * final filename can still be built correctly: {confirmed_trx}-{suffix}.
 */

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing from env vars.');
  }
  return createClient(url, key);
}

async function savePendingConfirmation({ chatId, fileId, proposedTrx, filenameSuffix, destinationFolderId, summary }) {
  const supabase = getClient();
  const { error } = await supabase.from('pending_confirmations').upsert({
    chat_id: String(chatId),
    file_id: fileId,
    proposed_trx: proposedTrx,
    filename_suffix: filenameSuffix,
    destination_folder_id: destinationFolderId,
    summary,
  });
  if (error) throw new Error(`Failed to save pending confirmation: ${error.message}`);
}

async function getPendingConfirmation(chatId) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('pending_confirmations')
    .select('*')
    .eq('chat_id', String(chatId))
    .maybeSingle();
  if (error) throw new Error(`Failed to read pending confirmation: ${error.message}`);
  return data; // null if none pending
}

async function clearPendingConfirmation(chatId) {
  const supabase = getClient();
  const { error } = await supabase.from('pending_confirmations').delete().eq('chat_id', String(chatId));
  if (error) throw new Error(`Failed to clear pending confirmation: ${error.message}`);
}

module.exports = { savePendingConfirmation, getPendingConfirmation, clearPendingConfirmation };
