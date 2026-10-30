"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { isAwaitingReply, type LoopOutcome } from "@/lib/chat/loop";
import {
  ChatError,
  repairConversation,
  retryConversation,
  sendUserMessage,
  type ChatHandlers,
} from "@/lib/chat/session";
import type { ToolName } from "@/lib/chat/toolDefs";
import { dayKey } from "@/lib/dates";
import { db, type ChangeRecord, type ChatMessage, type Proposal } from "@/lib/db";
import ChangeNotice from "./ChangeNotice";
import ConfirmCard from "./ConfirmCard";

const TOOL_STATUS: Record<ToolName, string> = {
  search_food: "Looking up food…",
  propose_log: "Preparing your card…",
  get_day: "Checking your log…",
  get_history: "Checking your history…",
  edit_entry: "Updating your log…",
  delete_entry: "Updating your log…",
  log_weight: "Logging your weight…",
  set_goals: "Updating your goals…",
  mark_day_incomplete: "Updating your log…",
  save_custom_food: "Saving that food…",
};

const OUTCOME_ERRORS: Record<Exclude<LoopOutcome, "done">, string> = {
  refused: "Claude declined to answer that. Try rewording it.",
  truncated: "That reply was cut off. Try a shorter request.",
  too_many_rounds: "That took too many steps, so it was stopped. Try again or rephrase it.",
};

type TimelineItem =
  | { kind: "message"; id: string; createdAt: number; role: ChatMessage["role"]; text: string }
  | { kind: "card"; id: string; createdAt: number; proposal: Proposal }
  | { kind: "change"; id: string; createdAt: number; change: ChangeRecord };

type TextBlock = { type: "text"; text: string };

function isTextBlock(block: unknown): block is TextBlock {
  return (block as TextBlock)?.type === "text";
}

// A user message holds the app_context block and then what was typed, so only
// the last text block is shown. Tool results have no text and show nothing.
function displayText(message: ChatMessage): string {
  if (!Array.isArray(message.content)) return "";
  const texts = message.content.filter(isTextBlock).map((block) => block.text);
  return message.role === "user" ? (texts.at(-1) ?? "") : texts.join("\n\n").trim();
}

export default function ChatScreen() {
  const [day, setDay] = useState(() => dayKey());
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = useLiveQuery(() => db.chatMessages.where("day").equals(day).sortBy("createdAt"), [day]);
  const proposals = useLiveQuery(() => db.proposals.where("day").equals(day).toArray(), [day]);
  const changes = useLiveQuery(() => db.changes.where("day").equals(day).toArray(), [day]);

  // Reopening after 4 am starts the new day's conversation.
  useEffect(() => {
    const refreshDay = () => {
      if (document.visibilityState === "visible") setDay(dayKey());
    };
    document.addEventListener("visibilitychange", refreshDay);
    return () => document.removeEventListener("visibilitychange", refreshDay);
  }, []);

  useEffect(() => {
    repairConversation(day).catch((caught) => console.error("Couldn't repair the conversation", caught));
  }, [day]);

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [
      ...(messages ?? []).flatMap((message): TimelineItem[] => {
        const text = displayText(message);
        return text
          ? [{ kind: "message", id: message.id, createdAt: message.createdAt, role: message.role, text }]
          : [];
      }),
      ...(proposals ?? []).map(
        (proposal): TimelineItem => ({ kind: "card", id: proposal.id, createdAt: proposal.createdAt, proposal }),
      ),
      ...(changes ?? []).map(
        (change): TimelineItem => ({ kind: "change", id: change.id, createdAt: change.createdAt, change }),
      ),
    ];
    return items.sort((a, b) => a.createdAt - b.createdAt);
  }, [messages, proposals, changes]);

  const lastItemKey = `${timeline.at(-1)?.id}|${timeline.length}`;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lastItemKey, streamingText, status]);

  const handlers: ChatHandlers = {
    onText: (text) => {
      setStatus(null);
      setStreamingText((current) => current + text);
    },
    onReset: () => setStreamingText(""),
    onToolStart: (name) => {
      setStreamingText("");
      setStatus(TOOL_STATUS[name as ToolName] ?? "Working…");
    },
  };

  async function run(start: () => Promise<LoopOutcome>) {
    setBusy(true);
    setError(null);
    setStatus("Thinking…");
    try {
      const outcome = await start();
      if (outcome !== "done") setError(OUTCOME_ERRORS[outcome]);
    } catch (caught) {
      console.error("Chat failed", caught);
      setError(caught instanceof ChatError ? caught.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
      setStatus(null);
      setStreamingText("");
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const currentDay = dayKey();
    setDay(currentDay);
    setDraft("");
    void run(() => sendUserMessage(currentDay, text, handlers));
  }

  const canRetry = !busy && messages !== undefined && isAwaitingReply(messages);

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {timeline.length === 0 && !busy && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted">
            <p className="font-medium text-foreground">What did you eat?</p>
            <p className="text-sm">Try &quot;350g chicken raw, 200g potatoes&quot; or &quot;78.8 this morning&quot;.</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {timeline.map((item) => {
            if (item.kind === "card") return <ConfirmCard key={item.id} proposal={item.proposal} />;
            if (item.kind === "change") return <ChangeNotice key={item.id} change={item.change} />;
            return item.role === "user" ? (
              <p
                key={item.id}
                className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-2xl bg-accent px-3.5 py-2 text-black"
              >
                {item.text}
              </p>
            ) : (
              <p key={item.id} className="whitespace-pre-wrap break-words pr-6">
                {item.text}
              </p>
            );
          })}

          {streamingText && <p className="whitespace-pre-wrap break-words pr-6">{streamingText}</p>}
          {status && (
            <p role="status" className="text-sm text-muted">
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {canRetry && (
            <div className="flex items-center gap-3 text-sm text-muted">
              <span>{error ? "" : "The last reply didn't finish."}</span>
              <button
                type="button"
                onClick={() => run(() => retryConversation(day, handlers))}
                className="h-9 rounded-lg border border-border px-3 font-semibold text-foreground"
              >
                Retry
              </button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex shrink-0 items-end gap-2 border-t border-border p-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={1}
          placeholder="Message CMAC"
          aria-label="Message CMAC"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 outline-none [field-sizing:content] focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="h-11 shrink-0 rounded-xl bg-accent px-4 font-semibold text-black disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
