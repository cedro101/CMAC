// The events /api/chat streams to the phone, one JSON object per line.
export type ChatErrorKind = "auth" | "rate_limited" | "bad_request" | "unavailable" | "other";

export type TurnMessage = {
  content: unknown[];
  stop_reason: string | null;
  usage?: unknown;
};

export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "reset" } // Discard the text so far, because the turn is being retried.
  | { type: "done"; message: TurnMessage }
  | { type: "error"; kind: ChatErrorKind; message: string };

// Reads a stream of JSON lines, handling lines split across network chunks.
export async function readEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as ChatStreamEvent);
    }

    if (done) {
      if (buffer.trim()) onEvent(JSON.parse(buffer) as ChatStreamEvent);
      return;
    }
  }
}
