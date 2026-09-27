const { agentToolDefinitions, executeAgentTool } = require('./agentTools');
const { orderToolDefinitions, executeOrderTool } = require('./orderTools');
const { RULEBOOK } = require('./rulebook');

/**
 * Same role-based tool scoping as the Claude version - text messages
 * never get file-move access, only a real incoming file does.
 */
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
 * Gemini's function-declaration shape is `{ name, description, parameters }`
 * - nearly identical to Anthropic's `{ name, description, input_schema }`,
 * just a renamed key. Converting here means agentTools.js/orderTools.js
 * never needed to change at all.
 */
function toGeminiToolDeclarations(allowedToolNames) {
  return ALL_TOOL_DEFINITIONS.filter((t) => allowedToolNames.includes(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));
}

// Confirmed on Google's free tier as of this build (no credit card required,
// permanent rate-limited tier - not an expiring trial). If this specific
// model string is ever retired, swap to whatever Google's current free
// Flash-tier model is at generativelanguage.googleapis.com.
const GEMINI_MODEL = 'gemini-2.5-flash';

async function askBrain(userMessage, telegramId) {
  const contextualMessage = `[Message from Telegram sender ID: ${telegramId}]\n${userMessage}`;
  return runBrainLoop([{ role: 'user', parts: [{ text: contextualMessage }] }], TEXT_TOOLS);
}

async function askBrainWithFile(fileBuffer, mimeType, fileId, originalFileName, chatId) {
  const initialMessage = {
    role: 'user',
    parts: [
      { inlineData: { mimeType, data: fileBuffer.toString('base64') } },
      {
        text: `A new file just arrived via Telegram. Its Drive file ID is "${fileId}", its original filename is "${originalFileName}", and the Telegram chat ID (needed if you call propose_new_trx) is "${chatId}". Follow your job instructions: check it against known customers/suppliers, classify it, and file it (move + rename) accordingly - or move it to the Unrecognized folder if it's junk. Then report what you did.`,
      },
    ],
  };
  return runBrainLoop([initialMessage], FILE_CLASSIFICATION_TOOLS);
}

async function runBrainLoop(initialContents, allowedToolNames) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "Brain isn't configured yet - GEMINI_API_KEY is missing from env vars.";
  }

  const toolDeclarations = toGeminiToolDeclarations(allowedToolNames);
  let contents = initialContents;

  for (let turn = 0; turn < 8; turn++) {
    // 8-turn cap: prevents a runaway tool-call loop from burning quota
    // indefinitely if something goes wrong.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          tools: [{ functionDeclarations: toolDeclarations }],
          systemInstruction: { parts: [{ text: RULEBOOK }] },
        }),
      }
    );

    const data = await res.json();
    if (data.error) {
      return `Brain error: ${data.error.message || JSON.stringify(data.error)}`;
    }

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const functionCallParts = parts.filter((p) => p.functionCall);

    if (functionCallParts.length === 0) {
      // No more tools to call - this is the final answer
      const textParts = parts.filter((p) => p.text);
      return textParts.map((p) => p.text).join('\n') || 'No response generated.';
    }

    // Model wants to use tools - execute them and feed results back.
    // Double-enforcement: even if a functionCall somehow named something
    // outside allowedToolNames, refuse to execute it here too.
    contents.push({ role: 'model', parts });

    const responseParts = [];
    for (const part of functionCallParts) {
      const { name, args } = part.functionCall;
      let result;
      if (!allowedToolNames.includes(name)) {
        result = { error: `Tool "${name}" is not permitted in this context.` };
      } else {
        try {
          result = await executeAnyTool(name, args || {});
        } catch (err) {
          result = { error: err.message };
        }
      }
      responseParts.push({ functionResponse: { name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return "Ran out of investigation steps without reaching an answer - something's probably looping. Check the logs.";
}

module.exports = { askBrain, askBrainWithFile };
