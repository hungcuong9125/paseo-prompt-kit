import { RewriteDeadline } from "../../rewrite-engine/deadline.js";

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** Fetches a bounded body under the same cancellation signal as the request. */
export async function readHttpResponse(url: string, init: RequestInit, deadline: RewriteDeadline, fetcher: typeof fetch) {
  const response = await deadline.wait(fetcher(url, { ...init, signal: deadline.signal, redirect: "error" }));
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Endpoint response exceeds the byte limit.");
  }
  if (!response.body) {
    const body = await deadline.wait(response.text());
    if (new TextEncoder().encode(body).length > MAX_RESPONSE_BYTES) throw new Error("Endpoint response exceeds the byte limit.");
    return { response, body };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  const cancel = () => { void reader.cancel().catch(() => {}); };
  deadline.signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const chunk = await deadline.wait(reader.read());
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("Endpoint response exceeds the byte limit.");
      body += decoder.decode(chunk.value, { stream: true });
    }
    if (deadline.signal.aborted) throw new Error("Rewrite deadline exceeded.");
    return { response, body: body + decoder.decode() };
  } finally {
    deadline.signal.removeEventListener("abort", cancel);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Provider text is untrusted even when it is an error. Redaction precedes truncation. */
export function redact(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join("[redacted]").split(encodeURIComponent(secret)).join("[redacted]");
  }
  return result;
}

export function diagnosticUrl(value: string): string {
  try { const url = new URL(value); return `${url.protocol}//${url.host}`; } catch { return "invalid endpoint URL"; }
}
