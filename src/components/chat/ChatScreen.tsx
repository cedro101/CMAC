"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { db, type ChangeRecord, type ChatMessage, type FoodCard, type Proposal } from "@/lib/db";
import { photoSrc, prepareLabelPhoto, type LabelPhoto } from "@/lib/image";
import ChangeNotice from "./ChangeNotice";
import ConfirmCard from "./ConfirmCard";
import LabelFoodCard from "./LabelFoodCard";

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
  propose_label_food: "Reading the label…",
  save_meal: "Saving that meal…",
  use_saved_meal: "Preparing your card…",
  create_batch: "Working out your batch…",
  list_batches: "Checking your batches…",
  estimate_maintenance: "Working out your maintenance…",
};

const OUTCOME_ERRORS: Record<Exclude<LoopOutcome, "done">, string> = {
  refused: "Claude declined to answer that. Try rewording it.",
  truncated: "That reply was cut off. Try a shorter request.",
  too_many_rounds: "That took too many steps, so it was stopped. Try again or rephrase it.",
};

const PINNED_DISTANCE_PX = 120;

const DEFAULT_PHOTO_TEXT = "Here's a nutrition label.";

type TimelineItem =
  | { kind: "message"; id: string; createdAt: number; role: ChatMessage["role"]; text: string; imageSrc: string | null }
  | { kind: "card"; id: string; createdAt: number; proposal: Proposal }
  | { kind: "label"; id: string; createdAt: number; card: FoodCard }
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

function displayImage(message: ChatMessage): string | null {
  if (!Array.isArray(message.content)) return null;
  const image = message.content.find((block) => block?.type === "image");
  if (!image) return null;
  return `data:${image.source.media_type};base64,${image.source.data}`;
}

export default function ChatScreen({
  day,
  readOnly = false,
  onBeforeSend,
}: {
  day: string;
  readOnly?: boolean;
  onBeforeSend?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<LabelPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  const messages = useLiveQuery(() => db.chatMessages.where("day").equals(day).sortBy("createdAt"), [day]);
  const proposals = useLiveQuery(() => db.proposals.where("day").equals(day).toArray(), [day]);
  const changes = useLiveQuery(() => db.changes.where("day").equals(day).toArray(), [day]);
  const foodCards = useLiveQuery(() => db.foodCards.where("day").equals(day).toArray(), [day]);

  useEffect(() => {
    if (readOnly) return;
    repairConversation(day).catch((caught) => console.error("Couldn't repair the conversation", caught));
  }, [day, readOnly]);

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [
      ...(messages ?? []).flatMap((message): TimelineItem[] => {
        const text = displayText(message);
        const imageSrc = displayImage(message);
        return text || imageSrc
          ? [{ kind: "message", id: message.id, createdAt: message.createdAt, role: message.role, text, imageSrc }]
          : [];
      }),
      ...(foodCards ?? []).map((card): TimelineItem => ({ kind: "label", id: card.id, createdAt: card.createdAt, card })),
      ...(proposals ?? []).map(
        (proposal): TimelineItem => ({ kind: "card", id: proposal.id, createdAt: proposal.createdAt, proposal }),
      ),
      ...(changes ?? []).map(
        (change): TimelineItem => ({ kind: "change", id: change.id, createdAt: change.createdAt, change }),
      ),
    ];
    return items.sort((a, b) => a.createdAt - b.createdAt);
  }, [messages, proposals, changes, foodCards]);

  // Keeps the newest message in view as cards finish drawing, replies stream in
  // and the food list opens or closes, unless you've scrolled up to read.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const observer = new ResizeObserver(() => {
      if (pinnedToBottom.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(scroller);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    pinnedToBottom.current = distance < PINNED_DISTANCE_PX;
  }

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
    const text = draft.trim() || (photo ? DEFAULT_PHOTO_TEXT : "");
    if (!text || busy) return;
    const currentDay = dayKey();
    const sentPhoto = photo ?? undefined;
    onBeforeSend?.();
    pinnedToBottom.current = true;
    setDraft("");
    setPhoto(null);
    void run(() => sendUserMessage(currentDay, text, handlers, sentPhoto));
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clearing the input lets the same photo be picked again.
    event.target.value = "";
    if (!file) return;
    setError(null);
    try {
      setPhoto(await prepareLabelPhoto(file));
    } catch (caught) {
      console.error("Couldn't read that photo", caught);
      setError("Couldn't read that photo. Try another one.");
    }
  }

  const canRetry = !readOnly && !busy && messages !== undefined && isAwaitingReply(messages);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {timeline.length === 0 && !busy && !readOnly && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted">
            <p className="font-medium text-foreground">What did you eat?</p>
            <p className="text-sm">Try &quot;350g chicken raw, 200g potatoes&quot; or &quot;78.8 this morning&quot;.</p>
          </div>
        )}
        {timeline.length === 0 && readOnly && <p className="text-center text-sm text-muted">No chat on this day.</p>}

        <div ref={contentRef} className="flex flex-col gap-3">
          {timeline.map((item) => {
            if (item.kind === "card") return <ConfirmCard key={item.id} proposal={item.proposal} />;
            if (item.kind === "label") return <LabelFoodCard key={item.id} card={item.card} />;
            if (item.kind === "change") return <ChangeNotice key={item.id} change={item.change} />;
            return item.role === "user" ? (
              <div key={item.id} className="flex max-w-[85%] flex-col items-end gap-1 self-end">
                {item.imageSrc && (
                  // A data URL from the phone, which next/image can't optimize.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageSrc} alt="Label photo you sent" className="max-h-48 rounded-xl" />
                )}
                <p className="whitespace-pre-wrap break-words rounded-2xl bg-accent px-3.5 py-2 text-black">{item.text}</p>
              </div>
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
        </div>
      </div>

      {!readOnly && photo && (
        <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoSrc(photo)} alt="Label photo to send" className="size-12 rounded-lg object-cover" />
          <p className="min-w-0 flex-1 text-sm text-muted">Label photo ready to send</p>
          <button type="button" onClick={() => setPhoto(null)} aria-label="Remove photo" className="size-10 text-xl text-muted">
            ×
          </button>
        </div>
      )}
      {!readOnly && (
        <form onSubmit={handleSubmit} className="flex shrink-0 items-end gap-2 border-t border-border p-2">
          <label aria-label="Attach a label photo" className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted">
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
              <circle cx="12" cy="13.5" r="3.5" />
            </svg>
            <input type="file" accept="image/*" onChange={handlePhoto} className="sr-only" />
          </label>
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
            disabled={busy || (!draft.trim() && !photo)}
            className="h-11 shrink-0 rounded-xl bg-accent px-4 font-semibold text-black disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
