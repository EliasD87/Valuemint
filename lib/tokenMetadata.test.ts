import { describe, expect, it, vi } from "vitest";
import {
  fetchManyTokenMetadata,
  fetchTokenMetadata,
  readTokenMetadata,
  tierOf,
  traitOf,
  type TokenMetadata,
} from "./tokenMetadata";

/**
 * These are not shape-checking exercises. Every case below is a document a
 * contract we do not control could return today, and before this validator
 * existed several of them took a page down with a TypeError during render.
 *
 * The marketplace lists any ERC-721 the explorer has indexed, so the metadata
 * URL is chosen by a stranger and fetched by every visitor's browser. That
 * makes this hostile input, and the point of the whole file is that nothing in
 * it throws.
 */

const GOOD = {
  name: "ValueChain Genesis #67 — LUMINATE",
  description: "The first NFT collection on ValueChain.",
  image: "ipfs://QmZUQTa5waSZCEqGiynkiTFyE9v9cgHEynP3BwwzuL4P4L",
  attributes: [
    { trait_type: "Design", value: "LUMINATE" },
    { trait_type: "Tier", value: "Epic" },
    { trait_type: "Edition", value: "6 of 8" },
    { trait_type: "Editions Minted", value: 8 },
  ],
};

describe("readTokenMetadata — a well-formed document", () => {
  it("passes a real first-party document through intact", () => {
    const doc = readTokenMetadata(GOOD);
    expect(doc).toBeDefined();
    expect(doc?.name).toBe("ValueChain Genesis #67 — LUMINATE");
    expect(doc?.image).toBe("ipfs://QmZUQTa5waSZCEqGiynkiTFyE9v9cgHEynP3BwwzuL4P4L");
    expect(doc?.attributes).toHaveLength(4);
  });

  it("keeps numeric trait values as numbers", () => {
    const doc = readTokenMetadata(GOOD);
    expect(doc?.attributes.find((a) => a.trait_type === "Editions Minted")?.value).toBe(8);
  });
});

describe("readTokenMetadata — what used to crash the page", () => {
  /**
   * The one that matters most. `"none".find` is not a function, and six hooks
   * called `.find` on this value during render.
   */
  it("survives attributes being a string", () => {
    const doc = readTokenMetadata({ name: "X", image: "ipfs://cid", attributes: "none" });
    expect(doc?.attributes).toEqual([]);
    expect(() => traitOf(doc, "Tier")).not.toThrow();
    expect(traitOf(doc, "Tier")).toBeUndefined();
  });

  /** `.map` on an object is the token page's version of the same fault. */
  it("survives attributes being an object", () => {
    const doc = readTokenMetadata({ name: "X", image: "ipfs://cid", attributes: { Tier: "Rare" } });
    expect(doc?.attributes).toEqual([]);
  });

  it("survives attributes being null", () => {
    const doc = readTokenMetadata({ name: "X", image: "ipfs://cid", attributes: null });
    expect(doc?.attributes).toEqual([]);
  });

  it("survives a number where a name should be", () => {
    const doc = readTokenMetadata({ name: 42, image: "ipfs://cid", attributes: [] });
    expect(doc?.name).toBe("");
    expect(doc?.image).toBe("ipfs://cid");
  });
});

describe("readTokenMetadata — things that are valid JSON but not documents", () => {
  it.each([
    ["a bare string", '"hello"'],
    ["a number", "7"],
    ["null", "null"],
    ["a top-level array", "[1,2,3]"],
    ["an empty object", "{}"],
  ])("returns undefined for %s", (_label, json) => {
    expect(readTokenMetadata(JSON.parse(json))).toBeUndefined();
  });

  it("returns undefined when every displayable field is missing", () => {
    // Describes nothing, so callers show "nothing was published" rather than a
    // shell with every field blank.
    expect(readTokenMetadata({ description: "just a description" })).toBeUndefined();
  });
});

describe("readTokenMetadata — partial documents keep what is good", () => {
  it("keeps a valid image when the traits array is rubbish", () => {
    const doc = readTokenMetadata({ image: "ipfs://cid", attributes: "broken" });
    expect(doc?.image).toBe("ipfs://cid");
  });

  it("drops only the bad entries out of a mixed attributes array", () => {
    const doc = readTokenMetadata({
      name: "X",
      attributes: [
        { trait_type: "Tier", value: "Rare" },
        "not an entry",
        null,
        { value: "no trait_type" },
        { trait_type: "Nested", value: { a: 1 } },
        { trait_type: "Design", value: "GOOD" },
      ],
    });
    expect(doc?.attributes).toHaveLength(2);
    expect(traitOf(doc, "Tier")).toBe("Rare");
    expect(traitOf(doc, "Design")).toBe("GOOD");
  });

  it("renders a boolean trait as a word rather than 'true'", () => {
    const doc = readTokenMetadata({ name: "X", attributes: [{ trait_type: "Burned", value: true }] });
    expect(traitOf(doc, "Burned")).toBe("Yes");
  });

  it("treats an empty image string as no image", () => {
    const doc = readTokenMetadata({ name: "X", image: "   " });
    expect(doc?.image).toBeUndefined();
  });
});

describe("traitOf", () => {
  it("matches exactly and case-sensitively, which is the documented behaviour", () => {
    const doc = readTokenMetadata(GOOD);
    expect(traitOf(doc, "Tier")).toBe("Epic");
    // Not a bug to fix by lowercasing: "Tier" and "tier" are different traits,
    // and guessing would let a collection shadow a real one.
    expect(traitOf(doc, "tier")).toBeUndefined();
  });

  it("is undefined-safe", () => {
    expect(traitOf(undefined, "Tier")).toBeUndefined();
  });

  it("stringifies numeric values so callers can render them", () => {
    const doc = readTokenMetadata(GOOD);
    expect(traitOf(doc, "Editions Minted")).toBe("8");
  });
});

describe("fetchTokenMetadata — a status is a hint, not the decision", () => {
  const body = {
    name: "SoDEXTreasureBox",
    description: "A Common tier treasure box issued by SoDEX on ValueChain.",
    image: "ipfs://bafybeibltyk5zokqdookfnccsfcoebl3qzp4gkx45bhtgrllm2t23kp67u",
    attributes: [{ trait_type: "Level", value: "Common" }],
  };
  const respond = (status: number, payload: unknown) =>
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    })) as unknown as typeof fetch;

  const withFetch = async (f: typeof fetch, run: () => Promise<unknown>) => {
    const real = globalThis.fetch;
    globalThis.fetch = f;
    try {
      return await run();
    } finally {
      globalThis.fetch = real;
    }
  };

  /**
   * The exact case that cost thousands of treasure boxes their name and
   * picture: SoDEX answers 501 with a complete document.
   */
  it("keeps a good document served with HTTP 501", async () => {
    const doc = (await withFetch(respond(501, body), () =>
      fetchTokenMetadata("https://example.test/sobox/0"),
    )) as TokenMetadata | undefined;
    expect(doc?.name).toBe("SoDEXTreasureBox");
    expect(traitOf(doc, "Level")).toBe("Common");
    expect(doc?.image).toContain("ipfs://");
  });

  it("still keeps one served with 200", async () => {
    const doc = (await withFetch(respond(200, body), () =>
      fetchTokenMetadata("https://example.test/sobox/0"),
    )) as TokenMetadata | undefined;
    expect(doc?.name).toBe("SoDEXTreasureBox");
  });

  /** A 404's JSON error page must not become a token. */
  it("rejects an error body whatever its status", async () => {
    const doc = await withFetch(respond(404, { error: "not found" }), () =>
      fetchTokenMetadata("https://example.test/missing"),
    );
    expect(doc).toBeUndefined();
  });

  it("rejects an empty document served with 200", async () => {
    const doc = await withFetch(respond(200, {}), () =>
      fetchTokenMetadata("https://example.test/empty"),
    );
    expect(doc).toBeUndefined();
  });

  /** Not JSON and not ok is a real failure, so the caller can retry. */
  it("throws when the body is not JSON and the status said no", async () => {
    const f = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    })) as unknown as typeof fetch;
    await expect(
      withFetch(f, () => fetchTokenMetadata("https://example.test/html")),
    ).rejects.toThrow(/502/);
  });
});

describe("fetchManyTokenMetadata — one request per distinct document", () => {
  const doc = (tier: string) => ({
    name: "SoDEXTreasureBox",
    description: `A ${tier} tier treasure box.`,
    image: `ipfs://cid-${tier}`,
    attributes: [{ trait_type: "Level", value: tier }],
  });

  const counting = () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      const tier = url.endsWith("/0") ? "Common" : "Uncommon";
      return { ok: true, status: 200, json: async () => doc(tier) };
    }) as unknown as typeof fetch;
    return { f, calls };
  };

  const withFetch = async <T,>(f: typeof fetch, run: () => Promise<T>): Promise<T> => {
    const real = globalThis.fetch;
    globalThis.fetch = f;
    try {
      return await run();
    } finally {
      globalThis.fetch = real;
    }
  };

  /**
   * The case this exists for. A wallet holding 626 boxes points at two
   * documents, because the tier is in the URL. Before deduping that was 626
   * requests to somebody else's API for two answers.
   */
  it("asks once per URL however many tokens share it", async () => {
    const { f, calls } = counting();
    const urls = Array.from({ length: 626 }, (_, i) =>
      i % 5 === 0
        ? "https://gw.test/api/v1/nft/token/sobox/1"
        : "https://gw.test/api/v1/nft/token/sobox/0",
    );

    const out = await withFetch(f, () => fetchManyTokenMetadata(urls, 10));

    // Two requests for 626 tokens. That is the whole point.
    expect(calls).toHaveLength(2);
    expect(out).toHaveLength(626);
    // Every fifth slot is the Uncommon URL, the rest Common — and each slot
    // must carry its own document, not whichever one resolved last.
    expect(traitOf(out[0], "Level")).toBe("Uncommon");
    expect(traitOf(out[1], "Level")).toBe("Common");
    expect(traitOf(out[5], "Level")).toBe("Uncommon");
    expect(out.filter((d) => traitOf(d, "Level") === "Uncommon")).toHaveLength(126);
  });

  it("still fetches every URL when they genuinely differ", async () => {
    const { f, calls } = counting();
    const urls = Array.from({ length: 30 }, (_, i) => `https://gw.test/cybr/${i + 1}`);
    await withFetch(f, () => fetchManyTokenMetadata(urls, 10));
    expect(calls).toHaveLength(30);
  });

  it("keeps the slots lined up with the URLs, gaps included", async () => {
    const { f } = counting();
    const out = await withFetch(f, () =>
      fetchManyTokenMetadata(
        ["https://gw.test/sobox/0", undefined, "", "https://gw.test/sobox/1"],
        10,
      ),
    );
    expect(out).toHaveLength(4);
    expect(traitOf(out[0], "Level")).toBe("Common");
    expect(out[1]).toBeUndefined();
    expect(out[2]).toBeUndefined();
    expect(traitOf(out[3], "Level")).toBe("Uncommon");
  });

  /** One unreachable document must not cost the others theirs. */
  it("survives one URL failing", async () => {
    const f = (async (url: string) => {
      if (String(url).endsWith("/bad")) throw new TypeError("Failed to fetch");
      return { ok: true, status: 200, json: async () => doc("Rare") };
    }) as unknown as typeof fetch;

    const out = await withFetch(f, () =>
      fetchManyTokenMetadata(["https://gw.test/bad", "https://gw.test/good"], 10),
    );
    expect(out[0]).toBeUndefined();
    expect(traitOf(out[1], "Level")).toBe("Rare");
  });
});

describe("tierOf — collections do not agree on what to call rarity", () => {
  const withTrait = (trait_type: string, value: string) =>
    readTokenMetadata({ name: "X", attributes: [{ trait_type, value }] });

  /** The one that sent thousands of boxes out with a blank chip. */
  it("finds the SoDEX boxes' 'Level'", () => {
    expect(tierOf(withTrait("Level", "SuperRare"))).toBe("SuperRare");
  });

  it("still finds this app's own 'Tier'", () => {
    expect(tierOf(withTrait("Tier", "Epic"))).toBe("Epic");
  });

  it.each([
    ["Rarity", "Legendary"],
    ["Rank", "S"],
    ["Grade", "A+"],
  ])("finds %s", (name, value) => {
    expect(tierOf(withTrait(name, value))).toBe(value);
  });

  it("prefers Tier when a collection publishes both", () => {
    const doc = readTokenMetadata({
      name: "X",
      attributes: [
        { trait_type: "Level", value: "99" },
        { trait_type: "Tier", value: "Epic" },
      ],
    });
    expect(tierOf(doc)).toBe("Epic");
  });

  it("is undefined when the collection publishes no rarity at all", () => {
    expect(tierOf(withTrait("Design", "LUMINATE"))).toBeUndefined();
    expect(tierOf(undefined)).toBeUndefined();
  });

  /** Widening which names count must not loosen how a name is matched. */
  it("stays case-sensitive", () => {
    expect(tierOf(withTrait("level", "Common"))).toBeUndefined();
  });
});
