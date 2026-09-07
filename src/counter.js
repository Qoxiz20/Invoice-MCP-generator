require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

/**
 * Requires these in your .env (see .env.example):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *
 * Requires this SQL run once in your Supabase project:
 *
 *   create table invoice_counters (
 *     year int not null,
 *     month int not null,
 *     last_number int not null default 0,
 *     primary key (year, month)
 *   );
 *
 *   create or replace function get_next_invoice_number(p_year int, p_month int)
 *   returns int as $$
 *   declare
 *     next_num int;
 *   begin
 *     insert into invoice_counters (year, month, last_number)
 *     values (p_year, p_month, 1)
 *     on conflict (year, month)
 *     do update set last_number = invoice_counters.last_number + 1
 *     returning last_number into next_num;
 *     return next_num;
 *   end;
 *   $$ language plpgsql;
 */

function getClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env. ' +
        'Invoice numbering requires Supabase to be configured — see src/counter.js for setup SQL.'
    );
  }

  return createClient(url, key);
}

/**
 * Returns a fully formatted invoice number, e.g. "INV-2026-08-0001".
 * Resets to 0001 automatically each new month (handled server-side
 * by the primary key on (year, month) in invoice_counters).
 */
async function getNextInvoiceNumber(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // JS months are 0-indexed

  const supabase = getClient();
  const { data, error } = await supabase.rpc('get_next_invoice_number', {
    p_year: year,
    p_month: month,
  });

  if (error) {
    throw new Error(`Failed to generate invoice number: ${error.message}`);
  }

  const runningNo = String(data).padStart(4, '0');
  const monthStr = String(month).padStart(2, '0');

  return `INV-${year}-${monthStr}-${runningNo}`;
}

module.exports = { getNextInvoiceNumber };
