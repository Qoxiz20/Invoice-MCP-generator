const { z } = require('zod');
const { getSheetsClient } = require('./auth');

const sheetsTools = [
  {
    name: 'sheets_read_range',
    description:
      'Read cell values from a Google Sheet. Use this before writing, to see current content and avoid overwriting the wrong row.',
    inputSchema: {
      spreadsheetId: z.string().describe("The Google Sheet's file ID (from its URL)"),
      range: z.string().describe("A1 notation range, e.g. 'Sheet1!A1:F20'"),
    },
    handler: async ({ spreadsheetId, range }) => {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
      return {
        content: [{ type: 'text', text: JSON.stringify(res.data.values || [], null, 2) }],
      };
    },
  },

  {
    name: 'sheets_update_range',
    description:
      'Overwrite cell values in a specific range of a Google Sheet. Use for correcting existing rows (e.g. fixing a wrong amount, updating a stock count). This REPLACES whatever is currently in that range.',
    inputSchema: {
      spreadsheetId: z.string().describe("The Google Sheet's file ID"),
      range: z.string().describe("A1 notation range to write to, e.g. 'Sheet1!A5:F5'"),
      values: z
        .array(z.array(z.union([z.string(), z.number(), z.null()])))
        .describe('2D array of row values matching the range dimensions'),
    },
    handler: async ({ spreadsheetId, range, values }) => {
      const sheets = getSheetsClient();
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
      return { content: [{ type: 'text', text: `Updated ${range} successfully.` }] };
    },
  },

  {
    name: 'sheets_append_row',
    description:
      'Append one or more new rows to the end of a sheet/table. Use for adding a new transaction log entry without disturbing existing rows.',
    inputSchema: {
      spreadsheetId: z.string().describe("The Google Sheet's file ID"),
      range: z
        .string()
        .describe("Sheet name or table range to append after, e.g. 'Purchase Log' or 'Purchase Log!A:P'"),
      values: z
        .array(z.array(z.union([z.string(), z.number(), z.null()])))
        .describe('2D array - each inner array is one new row'),
    },
    handler: async ({ spreadsheetId, range, values }) => {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });
      return {
        content: [
          { type: 'text', text: `Appended ${values.length} row(s). Updated range: ${res.data.updates.updatedRange}` },
        ],
      };
    },
  },

  {
    name: 'sheets_list_tabs',
    description: 'List all tab/sheet names inside a Google Sheets file, with their row/column counts.',
    inputSchema: { spreadsheetId: z.string().describe("The Google Sheet's file ID") },
    handler: async ({ spreadsheetId }) => {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.get({ spreadsheetId });
      const tabs = res.data.sheets.map((s) => ({
        title: s.properties.title,
        rows: s.properties.gridProperties.rowCount,
        cols: s.properties.gridProperties.columnCount,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(tabs, null, 2) }] };
    },
  },
];

module.exports = { sheetsTools };
