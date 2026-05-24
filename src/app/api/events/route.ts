import { subscribe, type LiveEvent } from "@/lib/event-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SSE endpoint. Query: ?channels=match:abc,market:xyz,tournament:t1
 * Streams a `data: {json}\n\n` per event published to any of the channels.
 * Keeps the connection alive with a ping comment every 25 s.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const channels = (url.searchParams.get("channels") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (channels.length === 0) {
    return new Response("channels required", { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      function send(payload: LiveEvent) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // controller already closed
        }
      }
      const unsubscribe = subscribe(channels, send);
      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // controller already closed
        }
      }, 25_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
