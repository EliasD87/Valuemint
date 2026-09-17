import "server-only";

/**
 * A hard ceiling on the bytes a route will read from a request.
 *
 * `content-length` is a courtesy, not a constraint: the sender chooses it, and
 * chunked encoding omits it entirely. `/api/pin` checked it — `Number(header ??
 * "0")` — which meant a body that simply declined to declare its size read as
 * zero and sailed through, after which `request.formData()` buffered whatever
 * turned up. The per-file and per-collection limits are real but they are
 * checked against `File.size` *after* parsing, which is too late to be a memory
 * bound.
 *
 * A signature cannot rescue this either. The upload claim is verified against a
 * hash of the received bytes — that is the whole point of it, and the fix for
 * an earlier finding — so the bytes must be received before the caller can be
 * authenticated. The only place left to stand is the stream.
 */

/** The message carried by the error `cappedBody` aborts a stream with. */
export const BODY_TOO_LARGE = "request-body-too-large";

/** True for the error `cappedBody` raises, wherever it surfaces. */
export function isBodyTooLarge(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.message === BODY_TOO_LARGE) return true;
  // Stream errors raised mid-parse arrive wrapped by the multipart reader, so
  // the cause has to be unwrapped rather than the throw site trusted.
  let cause: unknown = e.cause;
  for (let depth = 0; depth < 4 && cause instanceof Error; depth += 1) {
    if (cause.message === BODY_TOO_LARGE) return true;
    cause = cause.cause;
  }
  return false;
}

/**
 * The same request with its body wrapped in a counter that errors past `limit`.
 *
 * Returns a new `Request` rather than reading the stream here, so `formData()`
 * and the multipart parsing behind it are untouched — only the tap feeding them
 * is bounded. A request with no body is returned as-is; there is nothing to cap.
 *
 * @param limit Maximum bytes, multipart framing included.
 */
export function cappedBody(request: Request, limit: number): Request {
  const source = request.body;
  if (source === null) return request;

  let seen = 0;
  const counted = source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > limit) {
          controller.error(new Error(BODY_TOO_LARGE));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: counted,
    // Required by undici whenever the body is a stream.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}
