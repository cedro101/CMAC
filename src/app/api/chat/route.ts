import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { requirePasscode } from "@/lib/auth";
import { SYSTEM_PROMPT } from "@/lib/chat/prompt";
import { buildToolDefinitions } from "@/lib/chat/toolDefs";
import type { ChatErrorKind, ChatStreamEvent } from "@/lib/chat/streamEvents";
import { CLAUDE_EFFORT, CLAUDE_MAX_TOKENS, CLAUDE_MODEL } from "@/lib/config";

const MAX_PARSE_RETRIES = 2;

const RequestBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.unknown() }))
    .min(1)
    .max(1000),
});

function classifyError(error: unknown): { kind: ChatErrorKind; message: string } {
  if (error instanceof Anthropic.AuthenticationError) {
    return { kind: "auth", message: "The Claude API key was rejected." };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { kind: "rate_limited", message: "Claude is rate limiting requests. Try again in a minute." };
  }
  if (error instanceof Anthropic.BadRequestError) {
    // These messages are safe to show, and they explain problems such as low credit.
    return { kind: "bad_request", message: error.message };
  }
  if (error instanceof Anthropic.APIError) {
    return { kind: "unavailable", message: "Claude isn't available right now. Try again shortly." };
  }
  return { kind: "other", message: "Something went wrong reaching Claude." };
}

export async function POST(request: Request) {
  const denied = requirePasscode(request);
  if (denied) return denied;

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return Response.json({ error: "chat_not_configured" }, { status: 503 });

  const body = RequestBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const output = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        for (let attempt = 0; ; attempt++) {
          const stream = client.beta.messages.stream(
            {
              model: CLAUDE_MODEL,
              max_tokens: CLAUDE_MAX_TOKENS,
              system: [{ type: "text", text: SYSTEM_PROMPT }],
              tools: buildToolDefinitions(),
              messages: body.data.messages as Anthropic.Beta.BetaMessageParam[],
              cache_control: { type: "ephemeral" },
              output_config: { effort: CLAUDE_EFFORT },
              // If an app update changes the tools during a conversation, drop
              // old thinking blocks rather than failing the request.
              thinking: {
                type: "adaptive",
                block_binding: { prefix_mismatch_behavior: "drop_block" },
              },
              fallbacks: "default",
              betas: ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"],
            },
            { signal: request.signal },
          );
          stream.on("text", (text) => send({ type: "text", text }));

          try {
            const message = await stream.finalMessage();
            send({
              type: "done",
              message: {
                content: message.content,
                stop_reason: message.stop_reason,
                usage: message.usage,
              },
            });
            break;
          } catch (error) {
            // With eager input streaming, a tool input that can't be parsed
            // rejects here. Only that case is worth retrying.
            if (error instanceof Anthropic.APIError || request.signal.aborted || attempt >= MAX_PARSE_RETRIES) {
              throw error;
            }
            send({ type: "reset" });
          }
        }
      } catch (error) {
        if (!request.signal.aborted) {
          console.error("Chat request failed", error);
          send({ type: "error", ...classifyError(error) });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(output, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
