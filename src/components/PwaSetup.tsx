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
  }, []);

  return null;
}
