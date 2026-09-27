const { agentToolDefinitions, executeAgentTool } = require('./agentTools');
const { orderToolDefinitions, executeOrderTool } = require('./orderTools');
const { RULEBOOK } = require('./rulebook');

// Text commands never get the file-classification write tool (moving an
// existing file makes no sense from a text message) - but DO get the
// order-processing tools, since that's exactly what a text order needs.
const READ_ONLY_TOOLS = ['list_drop_folder', 'read_sheet_range', 'search_drive_files', 'get_customer_supplier_names', 'get_folder_map', 'identify_sender'];
const ORDER_TOOL_NAMES = orderToolDefinitions.map((t) => t.name);
const TEXT_TOOLS = [...READ_ONLY_TOOLS, ...ORDER_TOOL_NAMES];
const FILE_CLASSIFICATION_TOOLS = [...READ_ONLY_TOOLS, 'move_and_rename_file', 'propose_new_trx'];

const ALL_TOOL_DEFINITIONS = [...agentToolDefinitions, ...orderToolDefinitions];

function executeAnyTool(name, input) {
  if (ORDER_TOOL_NAMES.includes(name)) return executeOrderTool(name, input);
  return executeAgentTool(name, input);
}

/**
 * Text-only messages: investigation only for general questions, but full
 * order-processing tools are available too. telegramId is the sender's
 * numeric Telegram ID - a fixed identifier the brain should check via
 * identify_sender BEFORE trusting any name mentioned in the message text.
 */
async function askBrain(userMessage, telegramId) {
  const contextualMessage = `[Message from Telegram sender ID: ${telegramId}]\n${userMessage}`;
  return runBrainLoop([{ role: 'user', content: contextualMessage }], TEXT_TOOLS);
}

/**
 * A real file arrived - the model sees its actual content (not just the
 * filename) and has write access to actually file it.
 */
async function askBrainWithFile(fileBuffer, mimeType, fileId, originalFileName, chatId) {
  const isPdf = mimeType === 'application/pdf';
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBuffer.toString('base64') } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBuffer.toString('base64') } };

  const initialMessage = {
    role: 'user',
    content: [
      contentBlock,
      {
        type: 'text',
        text: `A new file just arrived via Telegram. Its Drive file ID is "${fileId}", its original filename is "${originalFileName}", and the Telegram chat ID (needed if you call propose_new_trx) is "${chatId}". Follow your job instructions: check it against known customers/suppliers, classify it, and file it (move + rename) accordingly - or move it to the Unrecognized folder if it's junk. Then report what you did.`,
      },
    ],
  };

  return runBrainLoop([initialMessage], FILE_CLASSIFICATION_TOOLS);
}

async function runBrainLoop(initialMessages, allowedToolNames) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "Brain isn't configured yet - ANTHROPIC_API_KEY is missing from env vars.";
  }

  const toolsForThisCall = ALL_TOOL_DEFINITIONS.filter((t) => allowedToolNames.includes(t.name));
  let messages = initialMessages;

  for (let turn = 0; turn < 8; turn++) {
    // 8-turn cap: prevents a runaway tool-call loop from burning tokens
    // indefinitely if something goes wrong.
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: RULEBOOK,
        tools: toolsForThisCall,
        messages,
      }),
    });

    const data = await res.json();
    if (data.type === 'error') {
      return `Brain error: ${data.error?.message || JSON.stringify(data)}`;
    }

    const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      // No more tools to call - this is the final answer
      const textBlocks = data.content.filter((b) => b.type === 'text');
      return textBlocks.map((b) => b.text).join('\n');
    }

    // Model wants to use tools - execute them and feed results back.
    // Double-enforcement: even if a tool_use block somehow named something
    // outside allowedToolNames, refuse to execute it here too.
    messages.push({ role: 'assistant', content: data.content });

    const toolResults = [];
    for (const block of toolUseBlocks) {
      let result;
      if (!allowedToolNames.includes(block.name)) {
        result = { error: `Tool "${block.name}" is not permitted in this context.` };
      } else {
        try {
          result = await executeAnyTool(block.name, block.input);
        } catch (err) {
          result = { error: err.message };
        }
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return "Ran out of investigation steps without reaching an answer - something's probably looping. Check the logs.";
}

module.exports = { askBrain, askBrainWithFile };
