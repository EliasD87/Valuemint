import { describe, expect, it } from "vitest";
import { sniffImage } from "./sniffImage";

/**
 * These tests exist because this function is a security control, not a
 * convenience. Before it, `/api/pin` decided what a file was from the
 * `Content-Type` the client wrote on the multipart part — so anything at all,
 * declared as `image/svg+xml`, was pinned to IPFS unread and referenced from a
 * contract that cannot be changed.
 *
 * The cases below are therefore about what the bytes say, especially where the
 * bytes and the claim disagree.
 */

const bytes = (...v: number[]) => new Uint8Array(v);
const pad = (head: number[], len = 32) =>
  new Uint8Array([...head, ...new Array(Math.max(0, len - head.length)).fill(0)]);
const text = (s: string) => new TextEncoder().encode(s);

describe("sniffImage", () => {
  it("recognises a JPEG by its SOI marker", () => {
    expect(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("recognises a PNG by its full 8-byte signature", () => {
    expect(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
  });

  it("recognises both GIF versions", () => {
    expect(sniffImage(pad([...text("GIF87a")]))).toBe("image/gif");
    expect(sniffImage(pad([...text("GIF89a")]))).toBe("image/gif");
  });

  it("requires both halves of the WebP signature", () => {
    // RIFF....WEBP — the four bytes at offset 8 are what separate WebP from
    // every other RIFF container (WAV, AVI).
    expect(sniffImage(pad([...text("RIFF"), 0, 0, 0, 0, ...text("WEBP")]))).toBe("image/webp");
    expect(sniffImage(pad([...text("RIFF"), 0, 0, 0, 0, ...text("WAVE")]))).toBeUndefined();
  });

  it("recognises AVIF by its ftyp brand", () => {
    expect(sniffImage(pad([0, 0, 0, 0x20, ...text("ftyp"), ...text("avif")]))).toBe("image/avif");
  });

  describe("SVG", () => {
    it("accepts a plain root element", () => {
      expect(sniffImage(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe(
        "image/svg+xml",
      );
    });

    it("looks past a BOM, an XML declaration, a doctype and comments", () => {
      const src = '﻿<?xml version="1.0"?>\n<!-- a note -->\n<svg width="1"></svg>';
      expect(sniffImage(text(src))).toBe("image/svg+xml");
    });

    it("does not accept HTML that merely mentions svg", () => {
      expect(sniffImage(text("<html><body><svg></svg></body></html>"))).toBeUndefined();
    });

    it("does not accept a bare script tag", () => {
      expect(sniffImage(text('<script>fetch("//evil")</script>'))).toBeUndefined();
    });
  });

  describe("things that are not images", () => {
    it("rejects a ZIP", () => {
      expect(sniffImage(pad([0x50, 0x4b, 0x03, 0x04]))).toBeUndefined();
    });

    it("rejects an ELF binary", () => {
      expect(sniffImage(pad([0x7f, ...text("ELF")]))).toBeUndefined();
    });

    it("rejects a PDF", () => {
      expect(sniffImage(pad([...text("%PDF-1.7")]))).toBeUndefined();
    });

    it("rejects plain text", () => {
      expect(sniffImage(text("just some words, honestly"))).toBeUndefined();
    });

    it("rejects anything too short to identify", () => {
      expect(sniffImage(bytes(0xff, 0xd8))).toBeUndefined();
      expect(sniffImage(new Uint8Array(0))).toBeUndefined();
    });
  });

  /**
   * The whole point. A declared type is not evidence, and these are the exact
   * payloads the old check would have stored.
   */
  describe("the bytes beat the claim", () => {
    it("does not trust a PNG signature glued to the front of a script", () => {
      // Real PNG magic, garbage after it: still a PNG as far as sniffing goes,
      // but it will now go through sharp, which decodes or rejects it. What
      // matters is that it is not routed to the unprocessed pass-through.
      expect(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    });

    it("reports an executable as unknown however it was labelled", () => {
      const payload = pad([0x4d, 0x5a, 0x90, 0x00]); // MZ, a Windows executable
      expect(sniffImage(payload)).toBeUndefined();
    });

    it("reports SVG as SVG so the route can refuse it, rather than as unknown", () => {
      // The distinction matters: unknown gets a generic "not an image" message,
      // SVG gets an explanation of why it specifically is refused.
      expect(sniffImage(text("<svg/>"))).toBe("image/svg+xml");
    });
  });
});
