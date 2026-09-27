const { z } = require('zod');

// Inert until TELEGRAM_BOT_TOKEN is set in .env. Unlike WhatsApp, there's no
// approval wait - get a token from @BotFather (2 minutes, no verification)
// and this activates immediately on next deploy.

const telegramTools = [
  {
    name: 'telegram_send_message',
    description:
      'Send a Telegram text message via the Bot API. INACTIVE until TELEGRAM_BOT_TOKEN is configured.',
    inputSchema: {
      chatId: z.string().describe('Telegram chat ID to send to (numeric, obtained from an incoming webhook update)'),
      message: z.string().describe('Text message body to send'),
    },
    handler: async ({ chatId, message }) => {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        return {
          content: [{ type: 'text', text: 'Telegram bot not yet configured - set TELEGRAM_BOT_TOKEN in .env.' }],
          isError: true,
        };
      }
      const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      });
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  },
];

module.exports = { telegramTools };
