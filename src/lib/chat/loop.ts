import { MAX_TOOL_ROUNDS } from "../config";
import type { TurnMessage } from "./streamEvents";
import type { ToolResult } from "./tools";

export type StoredMessage = { role: "user" | "assistant"; content: unknown };

type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown };

export type LoopOutcome = "done" | "refused" | "truncated" | "too_many_rounds";

export type LoopDeps = {
  loadMessages: () => Promise<StoredMessage[]>;
  append: (message: StoredMessage & { usage?: unknown }) => Promise<void>;
  sendTurn: (messages: StoredMessage[]) => Promise<TurnMessage>;
  runTool: (name: string, input: unknown) => Promise<ToolResult>;
  onToolStart?: (name: string) => void;
};

function toolUses(content: unknown): ToolUseBlock[] {
  if (!Array.isArray(content)) return [];
  return content.filter((block): block is ToolUseBlock => block?.type === "tool_use");
}

function toolResultBlock(id: string, result: ToolResult) {
  return {
    type: "tool_result",
    tool_use_id: id,
    content: result.content,
    ...(result.isError ? { is_error: true } : {}),
  };
}

// Runs Claude and its tools until it finishes. Every completed step is stored
// first, so an app closed partway through can pick up from there.
export async function runToolLoop(deps: LoopDeps): Promise<LoopOutcome> {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const message = await deps.sendTurn(await deps.loadMessages());
    const uses = toolUses(message.content);

    // Neither of these can be stored. A refused or cut-off turn may hold a
    // half-written tool call, and an unanswered tool call breaks later requests.
    if (message.stop_reason === "refusal") return "refused";
    if (message.stop_reason === "max_tokens" && uses.length > 0) return "truncated";

    await deps.append({ role: "assistant", content: message.content, usage: message.usage });

    if (message.stop_reason === "pause_turn") continue;
    if (uses.length === 0) return message.stop_reason === "max_tokens" ? "truncated" : "done";

    // All results go back in one message, which keeps parallel tool calls working.
    const results = [];
    for (const use of uses) {
      deps.onToolStart?.(use.name);
      results.push(toolResultBlock(use.id, await deps.runTool(use.name, use.input)));
    }
    await deps.append({ role: "user", content: results });
  }
  return "too_many_rounds";
}

// If the app was closed while tools were running, the last assistant message
// has tool calls with no results, which Claude's API would reject. Returns a
// message that closes them, or null when nothing needs closing.
export function repairInterruptedTools(messages: StoredMessage[]): StoredMessage | null {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return null;
  const uses = toolUses(last.content);
  if (uses.length === 0) return null;
  return {
    role: "user",
    content: uses.map((use) =>
      toolResultBlock(use.id, {
        content: "The app closed before this finished, so it may not have run. Check before repeating it.",
        isError: true,
      }),
    ),
  };
}

// True when the conversation is waiting on a reply that never came.
export function isAwaitingReply(messages: StoredMessage[]): boolean {
  return messages.at(-1)?.role === "user";
}
