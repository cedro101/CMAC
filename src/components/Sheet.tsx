"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// A panel that slides up from the bottom. It sits directly under the page body
// so it stays visible when the Today header hides for the keyboard, and it's
// sized to the visible area so the keyboard can't cover its fields.
export default function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-10 flex h-[var(--app-height,100dvh)] items-end bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="pb-safe max-h-full w-full overflow-y-auto rounded-t-2xl border-t border-border bg-surface"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
