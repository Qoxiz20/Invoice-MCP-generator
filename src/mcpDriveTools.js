const { z } = require('zod');
const { getDriveClient } = require('./auth');

// Note: existing drive.js already handles invoice PDF uploads for the
// order pipeline - kept as-is. This file adds general-purpose file
// operations for the MCP server (used when Claude, not the order
// pipeline, needs to move a file).

const mcpDriveTools = [
  {
    name: 'drive_move_file',
    description: 'Move a file to a different folder by changing its parent.',
    inputSchema: {
      fileId: z.string(),
      newParentId: z.string(),
    },
    handler: async ({ fileId, newParentId }) => {
      const drive = getDriveClient();
      const file = await drive.files.get({ fileId, fields: 'parents' });
      const previousParents = (file.data.parents || []).join(',');
      await drive.files.update({
        fileId,
        addParents: newParentId,
        removeParents: previousParents,
        fields: 'id, parents',
      });
      return { content: [{ type: 'text', text: `Moved file ${fileId} to folder ${newParentId}` }] };
    },
  },
];

module.exports = { mcpDriveTools };
