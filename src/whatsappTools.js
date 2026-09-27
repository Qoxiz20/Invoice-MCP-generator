const { z } = require('zod');

// Inert until WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set in .env
// (i.e. once Meta approves Cloud API access). No code changes needed later
// - just add the env vars and redeploy. This will eventually replace the
// manual create-invoice.js CLI once the real webhook is live.

const whatsappTools = [
  {
    name: 'whatsapp_send_message',
    description:
      'Send a WhatsApp text message via the Cloud API. INACTIVE until Meta approval is complete - will return an error until WHATSAPP_TOKEN is configured.',
    inputSchema: {
      to: z.string().describe('Recipient phone number in international format, e.g. 60168189180'),
      message: z.string().describe('Text message body to send'),
    },
    handler: async ({ to, message }) => {
      if (!process.env.WHATSAPP_TOKEN) {
        return {
          content: [
            {
              type: 'text',
              text: 'WhatsApp Cloud API not yet configured - pending Meta verification. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env once approved.',
            },
          ],
          isError: true,
        };
      }
      const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
];

module.exports = { whatsappTools };
