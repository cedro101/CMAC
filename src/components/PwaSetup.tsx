"use client";

import { useEffect } from "react";

export default function PwaSetup() {
  useEffect(() => {
    // Asks iOS not to clear the food log when the phone is low on storage.
    navigator.storage?.persist?.().catch(() => {});

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error) => console.error("Service worker failed", error));
    }

    // iOS doesn't resize the page for the keyboard, so size the app to the
    // visible area to keep the message box above it.
    const viewport = window.visualViewport;
    if (!viewport) return;
    const fitToViewport = () => {
      const root = document.documentElement;
      root.style.setProperty("--app-height", `${viewport.height}px`);
      root.toggleAttribute("data-keyboard-open", window.innerHeight - viewport.height > 100);
      window.scrollTo(0, 0);
    };
    fitToViewport();
    viewport.addEventListener("resize", fitToViewport);
    return () => viewport.removeEventListener("resize", fitToViewport);
  }, []);

  return null;
}
