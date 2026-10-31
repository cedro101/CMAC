"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createPortal } from "react-dom";
import ChatScreen from "@/components/chat/ChatScreen";
import { db } from "@/lib/db";

// The chat stays loaded while closed, so a reply keeps going if you close it
// and your typed message is still there when you come back.
export default function ChatPopup({
  day,
  readOnly,
  open,
  onOpen,
  onClose,
  onBeforeSend,
}: {
  day: string;
  readOnly: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onBeforeSend: () => void;
}) {
  const waitingCards = useLiveQuery(async () => {
    const isPending = (card: { status: string }) => card.status === "pending";
    const logs = await db.proposals.where("day").equals(day).filter(isPending).count();
    const labels = await db.foodCards.where("day").equals(day).filter(isPending).count();
    return logs + labels;
  }, [day]);

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="fixed right-4 z-[5] flex h-12 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-black shadow-lg shadow-black/40"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
        Chat
        {!!waitingCards && (
          <span className="rounded-full bg-black px-1.5 text-xs font-semibold tabular-nums text-accent">
            {waitingCards}
            <span className="sr-only"> waiting to confirm</span>
          </span>
        )}
      </button>

      {createPortal(
        <div
          hidden={!open}
          className="fixed inset-x-0 top-0 z-20 h-[var(--app-height,100dvh)] bg-black/60"
          onClick={onClose}
        >
          <div className="flex h-full items-end">
            <div
              role="dialog"
              aria-label="Chat"
              onClick={(event) => event.stopPropagation()}
              className="chat-panel pb-safe flex h-[85%] w-full flex-col rounded-t-2xl border-t border-border bg-background"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border py-1 pl-4 pr-1">
                <h2 className="font-semibold">Chat</h2>
                <button type="button" onClick={onClose} aria-label="Close chat" className="size-11 text-2xl text-muted">
                  ×
                </button>
              </div>
              <ChatScreen day={day} readOnly={readOnly} onBeforeSend={onBeforeSend} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
