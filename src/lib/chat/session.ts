import { db, type ChatMessage } from "../db";
import type { UsdaFood } from "../food/usdaParse";
import type { LabelPhoto } from "../image";
import { MODEL_KEY } from "../log";
import { apiFetch } from "../passcode";
import { buildBackground, buildTurnContext, wrapAppContext } from "./context";
import { repairInterruptedTools, runToolLoop, type LoopOutcome, type StoredMessage } from "./loop";
import { readEventStream, type TurnMessage } from "./streamEvents";
import { executeTool } from "./tools";

export type ChatHandlers = {
  onText: (text: string) => void;
  onReset: () => void;
  onToolStart: (name: string) => void;
};

export class ChatError extends Error {}

async function loadStoredMessages(day: string): Promise<ChatMessage[]> {
  return db.chatMessages.where("day").equals(day).sortBy("createdAt");
}

async function appendMessage(
  day: string,
  message: StoredMessage & { usage?: unknown; backgroundText?: string },
): Promise<void> {
  // Two messages in the same millisecond must still stay in order.
  const last = (await loadStoredMessages(day)).at(-1);
  await db.chatMessages.add({
    ...message,
    id: crypto.randomUUID(),
    day,
    createdAt: Math.max(Date.now(), (last?.createdAt ?? 0) + 1),
  });
}

function errorMessageForStatus(status: number): string {
  if (status === 401) return "Your passcode has changed. Enter the new one to continue.";
  if (status === 503) return "The server has no Claude API key yet. Add ANTHROPIC_API_KEY in Vercel and redeploy.";
  return "Something went wrong sending that message.";
}

async function sendTurn(messages: StoredMessage[], handlers: ChatHandlers): Promise<TurnMessage> {
  let response: Response;
  try {
    response = await apiFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model: (await db.settings.get(MODEL_KEY))?.value }),
    });
  } catch {
    throw new ChatError("Couldn't reach the server. Check your connection and try again.");
  }

  if (!response.ok || !response.body) throw new ChatError(errorMessageForStatus(response.status));

  let finished: TurnMessage | null = null;
  let failure: string | null = null;
  try {
    await readEventStream(response.body, (event) => {
      if (event.type === "text") handlers.onText(event.text);
      else if (event.type === "reset") handlers.onReset();
      else if (event.type === "done") finished = event.message;
      else failure = event.message;
    });
  } catch {
    throw new ChatError("The connection dropped before the reply finished. Try again.");
  }

  if (failure) throw new ChatError(failure);
  if (!finished) throw new ChatError("The connection dropped before the reply finished. Try again.");
  return finished;
}

async function searchUsda(query: string): Promise<{ available: boolean; foods: UsdaFood[] }> {
  const response = await apiFetch("/api/food/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) return { available: false, foods: [] };
  return response.json();
}

// Switching tabs can re-run the screen's startup code while a reply is still in
// progress, so this stops the repair below from closing tool calls still running.
let loopsRunning = 0;

async function runLoop(day: string, handlers: ChatHandlers): Promise<LoopOutcome> {
  loopsRunning += 1;
  try {
    return await runToolLoop({
      loadMessages: async () => {
        const stored = await loadStoredMessages(day);
        return stored.map(({ role, content }) => ({ role, content }));
      },
      append: (message) => appendMessage(day, message),
      sendTurn: (messages) => {
        handlers.onReset();
        return sendTurn(messages, handlers);
      },
      runTool: (name, input) => executeTool(name, input, searchUsda, day),
      onToolStart: handlers.onToolStart,
    });
  } finally {
    loopsRunning -= 1;
  }
}

// Adds the user's message with its app_context, then runs the conversation.
export async function sendUserMessage(
  day: string,
  text: string,
  handlers: ChatHandlers,
  photo?: LabelPhoto,
): Promise<LoopOutcome> {
  const stored = await loadStoredMessages(day);
  const lastBackground = stored.findLast((message) => message.backgroundText)?.backgroundText;
  const background = await buildBackground(day);
  const includeBackground = background !== lastBackground;
  const turn = await buildTurnContext(day, new Date());

  await appendMessage(day, {
    role: "user",
    content: [
      { type: "text", text: wrapAppContext(turn, includeBackground ? background : null) },
      ...(photo ? [{ type: "image", source: { type: "base64", media_type: photo.mediaType, data: photo.data } }] : []),
      { type: "text", text },
    ],
    ...(includeBackground ? { backgroundText: background } : {}),
  });

  return runLoop(day, handlers);
}

// Asks again without adding a new message, after a failed or interrupted reply.
export function retryConversation(day: string, handlers: ChatHandlers): Promise<LoopOutcome> {
  return runLoop(day, handlers);
}

// Closes any tool calls left open by the app being killed mid-reply.
export async function repairConversation(day: string): Promise<void> {
  if (loopsRunning > 0) return;
  const stored = await loadStoredMessages(day);
  const repair = repairInterruptedTools(stored.map(({ role, content }) => ({ role, content })));
  if (repair) await appendMessage(day, repair);
}
