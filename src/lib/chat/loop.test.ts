import { describe, expect, it } from "vitest";
import { MAX_TOOL_ROUNDS } from "../config";
import { isAwaitingReply, repairInterruptedTools, runToolLoop, type LoopDeps, type StoredMessage } from "./loop";
import { readEventStream, type ChatStreamEvent, type TurnMessage } from "./streamEvents";

const toolUse = (id: string, name = "search_food") => ({ type: "tool_use", id, name, input: { query: "apple" } });
const text = (value: string) => ({ type: "text", text: value });

function fakeDeps(turns: TurnMessage[]) {
  const stored: StoredMessage[] = [{ role: "user", content: "hi" }];
  const toolCalls: string[] = [];
  let sent = 0;
  const deps: LoopDeps = {
    loadMessages: async () => [...stored],
    append: async ({ role, content }) => {
      stored.push({ role, content });
    },
    sendTurn: async () => turns[Math.min(sent++, turns.length - 1)],
    runTool: async (name) => {
      toolCalls.push(name);
      return name === "broken" ? { content: "nope", isError: true } : { content: "ok", isError: false };
    },
  };
  return { deps, stored, toolCalls, sentCount: () => sent };
}

describe("runToolLoop", () => {
  it("stops after a plain reply", async () => {
    const { deps, stored } = fakeDeps([{ content: [text("Hello")], stop_reason: "end_turn" }]);
    expect(await runToolLoop(deps)).toBe("done");
    expect(stored.at(-1)).toEqual({ role: "assistant", content: [text("Hello")] });
  });

  it("runs tools and returns all results in one message", async () => {
    const { deps, stored, toolCalls } = fakeDeps([
      { content: [toolUse("a"), toolUse("b", "broken")], stop_reason: "tool_use" },
      { content: [text("Done")], stop_reason: "end_turn" },
    ]);
    expect(await runToolLoop(deps)).toBe("done");
    expect(toolCalls).toEqual(["search_food", "broken"]);
    expect(stored[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "a", content: "ok" },
        { type: "tool_result", tool_use_id: "b", content: "nope", is_error: true },
      ],
    });
  });

  it("stores assistant content unchanged, including thinking blocks", async () => {
    const thinking = { type: "thinking", thinking: "", signature: "abc" };
    const { deps, stored } = fakeDeps([{ content: [thinking, text("Hi")], stop_reason: "end_turn" }]);
    await runToolLoop(deps);
    expect(stored.at(-1)?.content).toEqual([thinking, text("Hi")]);
  });

  it("doesn't run tools or store a refused turn", async () => {
    const { deps, stored, toolCalls } = fakeDeps([{ content: [toolUse("a")], stop_reason: "refusal" }]);
    expect(await runToolLoop(deps)).toBe("refused");
    expect(toolCalls).toEqual([]);
    expect(stored).toHaveLength(1);
  });

  it("doesn't run a tool call that was cut off", async () => {
    const { deps, toolCalls } = fakeDeps([{ content: [toolUse("a")], stop_reason: "max_tokens" }]);
    expect(await runToolLoop(deps)).toBe("truncated");
    expect(toolCalls).toEqual([]);
  });

  it("continues after pause_turn", async () => {
    const { deps, sentCount } = fakeDeps([
      { content: [text("Working")], stop_reason: "pause_turn" },
      { content: [text("Done")], stop_reason: "end_turn" },
    ]);
    expect(await runToolLoop(deps)).toBe("done");
    expect(sentCount()).toBe(2);
  });

  it("stops a runaway loop", async () => {
    const { deps, sentCount, stored } = fakeDeps([{ content: [toolUse("a")], stop_reason: "tool_use" }]);
    expect(await runToolLoop(deps)).toBe("too_many_rounds");
    expect(sentCount()).toBe(MAX_TOOL_ROUNDS);
    // Every tool call still has its result, so later requests stay valid.
    expect(stored.at(-1)?.role).toBe("user");
  });
});

describe("repairInterruptedTools", () => {
  it("closes tool calls left open", () => {
    const repair = repairInterruptedTools([
      { role: "user", content: "hi" },
      { role: "assistant", content: [text("Looking"), toolUse("a"), toolUse("b")] },
    ]);
    expect(repair?.role).toBe("user");
    expect(repair?.content).toMatchObject([
      { tool_use_id: "a", is_error: true },
      { tool_use_id: "b", is_error: true },
    ]);
  });

  it("leaves finished conversations alone", () => {
    expect(repairInterruptedTools([{ role: "assistant", content: [text("Hi")] }])).toBeNull();
    expect(repairInterruptedTools([{ role: "user", content: "hi" }])).toBeNull();
    expect(repairInterruptedTools([])).toBeNull();
  });
});

describe("isAwaitingReply", () => {
  it("is true only when the user has the last word", () => {
    expect(isAwaitingReply([{ role: "user", content: "hi" }])).toBe(true);
    expect(isAwaitingReply([{ role: "assistant", content: [] }])).toBe(false);
    expect(isAwaitingReply([])).toBe(false);
  });
});

describe("readEventStream", () => {
  function streamOf(chunks: string[]) {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
  }

  it("handles lines split across chunks and several lines in one chunk", async () => {
    const events: ChatStreamEvent[] = [];
    await readEventStream(
      streamOf(['{"type":"te', 'xt","text":"Hi é"}\n{"type":"reset"}\n', '{"type":"text","text":"Yo"}']),
      (event) => events.push(event),
    );
    expect(events).toEqual([{ type: "text", text: "Hi é" }, { type: "reset" }, { type: "text", text: "Yo" }]);
  });
});
