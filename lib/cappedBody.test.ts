import { describe, expect, it } from "vitest";
import { BODY_TOO_LARGE, cappedBody, isBodyTooLarge } from "./cappedBody";

/**
 * The finding this closes: `/api/pin` bounded uploads by the `content-length`
 * header, which the sender chooses and chunked encoding omits. `Number(null ??
 * "0")` is zero, so a body that declined to declare its size passed the check
 * and `request.formData()` then buffered whatever arrived.
 *
 * Every test below sends a stream with no declared length, because that is the
 * shape the header check could not see.
 */

/** A request whose body is a stream of `chunks` bytes, with no content-length. */
function streamed(chunks: number[], type = "application/octet-stream"): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const n of chunks) controller.enqueue(new Uint8Array(n));
      controller.close();
    },
  });
  return new Request("https://example.test/api/pin", {
    method: "POST",
    headers: { "content-type": type },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("cappedBody", () => {
  it("passes a body that stays under the limit through untouched", async () => {
    const buf = await cappedBody(streamed([100, 100, 100]), 1_000).arrayBuffer();
    expect(buf.byteLength).toBe(300);
  });

  it("passes a body exactly on the limit", async () => {
    const buf = await cappedBody(streamed([500, 500]), 1_000).arrayBuffer();
    expect(buf.byteLength).toBe(1_000);
  });

  it("aborts one byte over the limit", async () => {
    await expect(cappedBody(streamed([500, 501]), 1_000).arrayBuffer()).rejects.toSatisfy(
      isBodyTooLarge,
    );
  });

  it("aborts a body with no declared length, however it is chunked", async () => {
    // The exact case the content-length check could not see.
    const many = Array.from({ length: 200 }, () => 64);
    await expect(cappedBody(streamed(many), 1_000).arrayBuffer()).rejects.toSatisfy(isBodyTooLarge);
  });

  it("stops reading rather than draining the whole stream", async () => {
    let produced = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced += 1;
        controller.enqueue(new Uint8Array(100));
        if (produced > 1_000) controller.close();
      },
    });
    const request = new Request("https://example.test/api/pin", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(cappedBody(request, 1_000).arrayBuffer()).rejects.toSatisfy(isBodyTooLarge);

    // The point of the cap is that the bytes are never held, so the producer
    // must be stopped near the limit rather than after the last chunk.
    expect(produced).toBeLessThan(100);
  });

  it("still parses multipart, so uploads are unaffected", async () => {
    const form = new FormData();
    form.set("config", '{"seed":"abcdefgh"}');
    form.set("images", new File([new Uint8Array(512)], "a.png", { type: "image/png" }));
    const request = new Request("https://example.test/api/pin", { method: "POST", body: form });

    const parsed = await cappedBody(request, 1_000_000).formData();
    expect(parsed.get("config")).toBe('{"seed":"abcdefgh"}');
    expect((parsed.get("images") as File).name).toBe("a.png");
  });

  it("returns a bodyless request unchanged", () => {
    const request = new Request("https://example.test/api/pin", { method: "GET" });
    expect(cappedBody(request, 10)).toBe(request);
  });
});

describe("isBodyTooLarge", () => {
  it("recognises the error directly", () => {
    expect(isBodyTooLarge(new Error(BODY_TOO_LARGE))).toBe(true);
  });

  it("recognises it wrapped by a parser, which is how it actually arrives", () => {
    const wrapped = new Error("Failed to parse body as FormData", {
      cause: new Error("terminated", { cause: new Error(BODY_TOO_LARGE) }),
    });
    expect(isBodyTooLarge(wrapped)).toBe(true);
  });

  it("does not claim unrelated failures", () => {
    expect(isBodyTooLarge(new Error("Expected a multipart upload."))).toBe(false);
    expect(isBodyTooLarge("nope")).toBe(false);
    expect(isBodyTooLarge(undefined)).toBe(false);
  });
});
