import { describe, expect, it } from "vitest";
import { isDisplayable, isFilterable, isPlumbing } from "@/lib/traitRoles";
import { documentFor } from "@/lib/buildMetadata";
import { tokenDocument } from "@/lib/tokenDocument";

/**
 * These lists decide what a collector sees and what they can slice a collection
 * by, so the interesting tests are not the lists themselves — they are the ones
 * run against the attributes `/api/metadata` actually emits. A name changing at
 * one end and not the other is the whole failure mode.
 */

const DOC = documentFor(
  {
    collectionName: "Test",
    description: "A test collection.",
    imagesCid: "QmA",
    gateway: (cid, path) => `https://g.test/${cid}/${path}`,
  },
  { design: { file: "a.jpg", name: "ORIGIN", count: 3, tier: "Legendary" }, edition: 1 },
  1,
);

const EMITTED = (DOC.attributes as Array<{ trait_type: string }>).map((a) => a.trait_type);

describe("against the attributes a manifest-backed token really carries", () => {
  it("emits exactly the four this file has opinions about", () => {
    expect(EMITTED).toEqual(["Design", "Tier", "Edition", "Editions Minted"]);
  });

  it("offers Design and Tier as filters, and nothing else", () => {
    expect(EMITTED.filter(isFilterable)).toEqual(["Design", "Tier"]);
  });

  it("shows everything except the bookkeeping", () => {
    expect(EMITTED.filter(isDisplayable)).toEqual(["Design", "Tier", "Edition"]);
  });
});

describe("isPlumbing", () => {
  it("names the two fields carried for other code to read", () => {
    expect(isPlumbing("Editions Minted")).toBe(true);
    expect(isPlumbing("Design Number")).toBe(true);
  });

  it("does not touch a real trait", () => {
    for (const t of ["Design", "Tier", "Edition", "Status", "Serial", "Volume"]) {
      expect(isPlumbing(t)).toBe(false);
    }
  });

  it("ignores casing, because manifests are written by hand", () => {
    expect(isPlumbing("EDITIONS MINTED")).toBe(true);
    expect(isPlumbing("editions minted")).toBe(true);
  });
});

describe("isFilterable", () => {
  it("keeps the two axes a person actually asks for", () => {
    expect(isFilterable("Design")).toBe(true);
    expect(isFilterable("Tier")).toBe(true);
  });

  it("refuses Edition — its values run across designs, not within one", () => {
    expect(isFilterable("Edition")).toBe(false);
  });

  /**
   * The one with teeth. An unrevealed token deliberately carries no Design and
   * no Tier so nothing can be counted; a Status filter would hand the count
   * straight back as a bucket size.
   */
  it("refuses Status, so an unrevealed tail can never become a bucket", () => {
    expect(isFilterable("Status")).toBe(false);
    expect(isDisplayable("Status")).toBe(true);
  });

  it("refuses plumbing too", () => {
    expect(isFilterable("Editions Minted")).toBe(false);
    expect(isFilterable("Design Number")).toBe(false);
  });

  /** A contract from somewhere else publishes whatever it likes. */
  it("allows an unknown trait from a third-party contract", () => {
    for (const t of ["Background", "Hat", "Eyes"]) {
      expect(isFilterable(t)).toBe(true);
    }
  });

  it("refuses a missing or empty name rather than drawing a nameless dropdown", () => {
    for (const t of [undefined, null, ""]) {
      expect(isFilterable(t)).toBe(false);
    }
  });
});

/**
 * Against what the route really emits for a Trenches piece: four attributes,
 * one axis. Depth Number and Volume Threshold restate Depth, and Serial runs
 * across depths, so only Depth is offered as a filter.
 */
describe("a Trenches piece", () => {
  it("is filtered by Depth alone, and still shows all four", async () => {
    const result = await tokenDocument("sodex-trenches", 4_000_001);
    expect(result.ok).toBe(true);
    const names = ((result as { document: { attributes: { trait_type: string }[] } }).document.attributes).map(
      (a) => a.trait_type,
    );
    expect(names).toEqual(["Depth", "Depth Number", "Volume Threshold", "Serial"]);
    expect(names.filter(isFilterable)).toEqual(["Depth"]);
    expect(names.filter(isDisplayable)).toEqual(names);
  });
});
