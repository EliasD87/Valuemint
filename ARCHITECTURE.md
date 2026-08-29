# ValueMint — frontend architecture

Next.js 16 (App Router, Turbopack) · React 19 · wagmi 2 · viem 2. No backend beyond one
route handler; everything else is read straight from the chain.

**The rule that governs this whole app:** ValueMint is a marketplace that *hosts* collections.
It is not one collection's website. Any page that hardcodes a collection address is a bug —
that mistake was made and fixed repeatedly, and it is the single easiest way to regress.

---

## Routes

| Route | Purpose | Data source | Notes |
|---|---|---|---|
| `/` | Landing. Hero, collections rail, featured grid, holders board | `useEverything(12)` | Samples 12/collection — a browse surface, not a ledger |
| `/mint` | Index of every collection with minting open | `useAllCollections` | Splits open vs "closed, still tradeable" |
| `/collections` | Every ERC-721 on the chain | `useAllCollections` + `useCollectionProbe` | Has a paste-an-address escape hatch |
| `/collection/[address]` | One collection: its pieces + its mint panel | `useGenericTokens`, `MintPanel` | Works for **any** ERC-721, via the standard interface |
| `/token/[address]/[id]` | One piece: buy, list, cancel, traits | `useTokenMetadata`, `useTrade` | Route is collection-scoped; it used to be `/token/[id]` and was wrong |
| `/market` | Everything for sale, chain-wide | `useListingFeed` | Event-driven. Never samples |
| `/portfolio` | What the connected wallet holds | `useHoldings` | Enumerable-based. Never samples |
| `/create` | Deploy a collection, artwork included | `/api/pin` then factory | Four steps, **one transaction** |
| `/manage` | Collections this wallet owns | `useOwnedCollections` | Ownership read from each contract's `owner()` |
| `/manage/[address]` | Owner console for one collection | direct reads + writes | Mint toggle, artwork, price, reserve, proceeds |
| `/api/pin` | Pins artwork + generates metadata | `lib/pinning`, `lib/buildMetadata` | The only server code. Holds `PINATA_JWT`. **Gated** — see below |

---

## The three ways tokens are found, and why they differ

This is the part most worth remembering. All three exist because each page has a different
tolerance for being incomplete, and using the wrong one causes silent, invisible data loss.

**1. Sampling — `useEverything(n)`**
Walks the first *n* tokens of every collection. Cheap, bounded, and **incomplete by design**.
Fine for the home page, where the job is "show me some of what's around". The page must say
it is sampling wherever that could mislead.

**2. Enumeration — `useHoldings(address)`**
`balanceOf` then `tokenOfOwnerByIndex` for exactly the ids that address owns. Two rounds of
multicall, complete regardless of collection size. Used by `/portfolio`.

> A portfolio was briefly built on sampling. It hid 20 of one wallet's 50 tokens and made
> another wallet's only token invisible entirely, because its id was past the sample. A
> portfolio that under-reports is worse than none.

`tokenOfOwnerByIndex` comes from ERC721Enumerable, which is *optional*. Collections without
it report a balance but cannot list ids; `useHoldings` returns those as `unlistable` so the
page can name them instead of dropping them silently.

**3. Events — `useListingFeed()`**
There is no per-owner index for listings, so enumeration does not apply, and scanning every
token to ask "is this listed?" costs a call per token in existence. Instead it reads the
marketplace's `Listed` events via `eth_getLogs`, which names exactly the tokens ever offered —
a far smaller set — then **re-checks each on chain**, because an event only proves a listing
once existed. It may since have sold, been cancelled, or gone stale.

`eth_getLogs` was verified to work across ValueChain's full history before being relied on.
The page degrades honestly if a node refuses.

---

## Hooks

| Hook | Returns |
|---|---|
| `useAllCollections` | Every collection + live state. **The** answer to "what collections exist" |
| `useOwnedCollections` | Filtered to what the connected wallet owns |
| `useRegistry` | Factory registries — current **and legacy**, so redeploys don't strand collections |
| `useDiscovery` | Blockscout's ERC-721 index, plus `useCollectionProbe` for arbitrary addresses |
| `useEverything` | Sampled tokens across collections |
| `useHoldings` | Complete holdings for one address |
| `useListingFeed` | Live listings from events |
| `useGenericTokens` | Tokens of one arbitrary ERC-721, standard interface only |
| `useTokens` / `useCollection` | Older single-collection helpers. Prefer the above |
| `useTrade` | approve · list · cancel · buy, plus `usePreviewSale` |

Collection discovery merges two sources because each misses what the other has: the block
explorer indexes any ERC-721 but is slow to notice new ones; the factory registry knows
everything made here instantly but nothing made elsewhere.

---

## Contracts

Addresses live in `config/contracts.ts`, **generated** by
`contracts/scripts/export-abis.mjs`. Never hand-edit it — regeneration overwrites it. That
script also emits `legacyFactories`.

```
Marketplace  0x0c0c1209C54fD220BcE31c81a9C044cE5e8928C5   verified
Factory      0x7DFcafE62ac616CEa70C6f98115280454cE2b54a
Genesis      0x5Fadc59297e86aceA20Bff519aea0f9651Cdc90B
legacy factory 0xb1153Aa3dbADD59e3e6aa61452f2DAa90b99A859  still read
```

After any contract change: `cd contracts && node scripts/export-abis.mjs`.

---

## Traps that have already cost time

**The ABI exporter wrote to a dead path.** It targeted `web/src/config/` from the Vite era and
kept "succeeding" after the Next migration, so contract changes appeared not to exist. If a
new contract function seems missing from the ABI, check where the exporter is writing.

**`tokenURI(1)` is not a metadata check.** It reverts when nothing is minted, so a freshly
configured collection reads identically to one with no artwork. The contract now has a public
`baseURI()`. Collections deployed before that getter return `undefined` — meaning *cannot
tell*, not *missing* — and the console distinguishes those cases.

**The console's error buffer keeps stale entries.** Errors from a previous bundle persist
across navigations. Confirm against a fresh page render before chasing one.

**`PINATA_JWT` must never be `NEXT_PUBLIC_`.** `lib/pinning.ts` imports `server-only`, so the
build fails loudly if a client component pulls it in. Keep that import.

**The block explorer is unreliable and is not the source of truth.** It has reported mined
transactions as "Failed", left deployments "Pending" for an hour, and crawled NFT metadata at a
few tokens per hour. Check receipts over RPC before believing it.

---

---

## The design system

Everything visual is a token in `styles/tokens.css`. **Never write a literal
colour in a component stylesheet** - it will be right in one theme and wrong in
the other. Adding a colour means adding it in all three blocks: `:root` (light),
the `prefers-color-scheme: dark` block (guarded `:not([data-theme="light"])`),
and `:root[data-theme="dark"]` (explicit choice).

**Type.** Bricolage Grotesque for headings, Geist for everything else, both
self-hosted via `next/font` in `layout.tsx`. There is **no monospace face.**
Figures line up with `font-variant-numeric: tabular-nums`; the `.mono` class
still exists and is still applied in ~60 places, but it now sets tabular figures
rather than a family. `--mono` is a deliberate alias of `--sans` so those call
sites stay valid. Do not reintroduce a code face - it was applied to plain
status words like "Not listed" and made a gallery read like an IDE.

**Surfaces.** `--paper` is *the page*. Anything that is a **thing on** the page -
card, panel, menu, input, button - uses `--surface`. In light both are white and
a hairline separates them; that flatness is the design. In dark the ramp
inverts and `--surface` sits *above* the ground, because a card the same colour
as the page simply disappears. A well nested inside a card uses `--surface-2`,
never `--paper-2`: in dark `--paper-2` resolves to exactly `--surface`.

**The dark band.** `.on-dark`, `.hero`, `.cta` and `.footer` are dark in *both*
themes, so everything inside them must come from the `--dark-*` family. Reaching
for `--paper` or `--ink` there looks right in light and collapses in dark, where
`--paper` is near-black. `.on-dark` is used both as a band and as a modifier on
a single control, so its rules are written for both forms.

**Contrast.** Every route was audited against WCAG AA in both themes and is
clean. `--ink-3` carries labels and captions and clears 4.5:1; `--ink-4` is
decoration only - rules, disabled glyphs - and must not carry content. It used
to, at 2.4:1.

---

## Artwork

Collection cards lead with the pieces. `CollectionCard` is one component used by
both `/collections` and `/mint` — that markup previously existed in **four**
copies, which is exactly why all four showed grey initials where the art should
be. `useCollectionArt` groups `useEverything`'s samples by collection rather
than issuing a second set of reads for the same tokens.

A collection with nothing minted still renders a cover — its initials, set large
— so a grid keeps one rhythm instead of some cards being short.

**Everything on IPFS is served at the size it was pinned.** There is no smaller
variant to request, and one collection's cover was a 3.2 MB PNG being drawn into
a 95×116 thumbnail — 3.9 MB of covers on a three-collection page. Art now goes
through the `Art` component, which routes allowed hosts to Next's optimiser
(36 KB for that same page, a 99% cut) and falls back to a plain `<img>` for
anything else, since collection metadata may point at a host we have never seen.

`lib/media.ts` holds the allowlist and is imported by `next.config.ts`, so the
two cannot drift. **Do not widen it to `hostname: "**"`** — that turns the
deployment into an open image proxy anyone can spend the transformation quota
on.

---

## Hiding a collection

A deployed contract cannot be deleted and the factory registry is append-only,
so "removing" one means this marketplace stops listing it. `config/hidden.ts`
holds the addresses with a reason against each.

The filter is applied in **`useRegistry` and `useDiscovery`** — the two sources —
not in `useAllCollections`. `/collections`, `/mint` and `/` each merge those two
hooks themselves rather than going through `useAllCollections`, so a filter
placed downstream silently misses all three.

Hidden collections stay reachable at `/collection/<address>` and stay fully
functional on chain. That is deliberate: holders still own them, and the
frontend should not imply otherwise about state it does not control.

---

## Where creator artwork goes

`/api/pin` stores to **Filebase** when `FILEBASE_KEY`/`SECRET`/`BUCKET` are set,
and falls back to Pinata otherwise. Both are IPFS; the difference is how they
address content, and that difference is recorded in the manifest.

**A collection costs a fixed number of objects, not one per token.** It used to
pin one metadata document per token, so a 1000-piece collection needed 1010
files and simply failed — the pinning account's *file count* runs out long
before its storage does. Now one manifest describes the whole collection and
each token's JSON is recomputed from its seed on request.

| | 1000-token collection |
|---|---|
| Before | 1,010 files — failed outright |
| Now | 10 images + 1 manifest |

**Manifest versions, both readable forever** — a contract's `baseURI` is
immutable, so a manifest written today must still parse in five years:

- **v1** — one directory CID, each design a file inside it. What Pinata produces.
- **v2** — one CID per design. Filebase's S3 API addresses objects individually
  and returns no directory CID. Also more portable: every image verifies on its
  own rather than only as part of a folder.

**Gateways are tried in order** (`MANIFEST_GATEWAYS` in the metadata route). A
dedicated Pinata gateway serves only what that Pinata account pinned and 404s
everything else, so a Filebase-stored manifest is invisible to it. Collections
predating the switch live on one, new ones on the other, and both must resolve.

**`lib/filebase.ts` signs SigV4 by hand** rather than importing
`@aws-sdk/client-s3`, which would add megabytes to every serverless function for
one PUT. A bucket on Filebase's *S3* network stores bytes but returns no CID —
`pinFile` treats a missing `x-amz-meta-cid` as a hard error, because silently
storing NFT artwork that is not content-addressed would not surface until
someone checked provenance months later.

---

## The Explore page, and one-collection thinking

`/` was built when this site was one collection's homepage, and kept assuming
it. Every one of these read as a normal feature until you had a second
collection:

- **`useCollectionStats` reads one hardcoded address.** The strip and hero
  reported that collection's supply under the label "pieces minted", so the
  front page said 51 when the chain held 161 — and drifted further with each
  collection added. Use **`useChainStats`** for anything marketplace-wide. The
  old hook is deleted; `hooks/useCollection.ts` now carries a warning that the
  whole module is scoped to one address.
- **The filter chips were Genesis's rarity tiers** (Legendary/Epic/Rare/Common),
  hardcoded. Collections without tiers — most of them — could not be filtered
  to at all, and picking a tier hid every piece not from that one collection.
  Chips are derived from the collections actually present.
- **The featured grid concatenated samples**, so it showed one collection's
  entire sample before any of the next. It interleaves now, which is what makes
  the page look like a marketplace rather than a gallery.
- **"Top holders" was removed entirely.** It divided by `tokens.length` — a
  fixed-size sample — and called the result "of supply". Even corrected it was
  the wrong section: ranking holders across collections compares units that are
  not comparable (five of a hundred is not five of ten thousand), and with few
  holders it rendered as a single row telling every visitor that one address
  owned everything. The slot now lists what is **open to mint**, cheapest
  first — always true, always actionable, and it grows as creators arrive.
- **The plate caption showed `token.tier`**, blank for most pieces. It shows the
  collection.
- **`/collections` linked the first collection to `/`** instead of its own page,
  so clicking it bounced you to Explore.

The rule from the top of this document is the one that catches all of these:
*any page that hardcodes a collection is a bug.* It is worth re-reading
`useTrade`, whose `collection` parameter still defaults to that same address —
a caller that forgets to pass one trades against the wrong contract silently.

---

## More traps

**Transitions freeze when the Browser pane is hidden.** The page stops
compositing, so `getComputedStyle` returns a transition's *start* value forever.
A panel that opens correctly will measure as `max-height: 0` - even with an
inline `!important`. Before measuring anything animated, inject
`*{transition:none!important;animation:none!important}`, measure, then remove
it. Hours can go into "debugging" CSS that was never broken.

**`.btn-solid` and `.eyebrow-dim` were used in markup with no rule anywhere.**
The wallet's connect button - the first thing a visitor must click - rendered as
a plain outline control for that reason. When something looks unstyled, diff the
classes used in `.tsx` against the classes defined in `.css` before adjusting
spacing; that check also found 13 unstyled classes on `/create`.

---

## Securing /api/pin

This endpoint spends a **paid Pinata account** using a credential only the
server holds. It was open: anyone who knew the URL could loop it and burn the
whole storage allowance on content that cannot easily be un-pinned. The
per-request caps (8 MB/file, 50 files, 60 MB, 2000 supply) bound *one* request,
never the number of requests.

Three gates now stand in front of it, and all three are needed:

| Gate | Stops | Why alone it is not enough |
|---|---|---|
| Wallet signature over a digest of the upload | Anonymous and replayed calls | Generating wallets is free |
| On-chain SOSO balance floor (default 0.001) | Bulk throwaway wallets | A funded attacker still gets a budget |
| Rate limit per wallet and per caller | Sustained abuse from either | Memory-only today — see below |

**The signature covers the payload, not just the identity.** The signed message
embeds a SHA-256 digest of the config JSON plus every file's name and size, so a
captured signature cannot be replayed against *different* artwork. It carries a
timestamp with a 5-minute life, and each signature is single-use — a spent one
is refused even inside its window.

`lib/uploadClaim.ts` builds that message and is deliberately **isomorphic and
free of `server-only`**: the browser signs it and the server rebuilds it, and if
the two ever differ by one character every upload fails. Never duplicate that
text — import it.

**Ordering in the route is load-bearing.** Header checks and the caller rate
limit run *before* `request.formData()`, so an unsigned or throttled caller
never causes a 60 MB body to be parsed. The signature is verified as soon as
names and sizes are known — a `File` exposes both without reading a byte — and
before any buffer is copied or anything is pinned. `rawConfig` is passed to the
verifier **verbatim**; re-serialising the parsed object reorders keys and the
digest stops matching.

**The balance check fails closed.** If the RPC is unreachable the upload is
refused, because an outage must not become a way to skip the gate.

### Before deploying to Vercel

`lib/rateLimit.ts` keeps counters in module memory. That is correct on one
long-lived server and **weak on serverless**: every lambda has its own memory,
so N warm instances means roughly N times the limit, and a cold start forgets
everything. It is written behind a `RateLimiter` interface for exactly this
reason — implement it over Vercel KV or Upstash and change the export at the
bottom of the file. Nothing that calls `limiter.take()` needs to change.

The signature and balance gates are unaffected by this; they hold on serverless
as they are.

Verified with an adversarial suite (unsigned, malformed, wrong claimed address,
payload swapped after signing, config swapped after signing, expired,
future-dated, replayed, unfunded) — all refused; a correctly signed request from
a funded wallet passes; limits engage at exactly the 10th and 30th request.

---

## Conventions

- Everything touching wagmi is `"use client"`. Pages are client components; only `/api/pin` runs
  on the server.
- The `QueryClient` is created inside `useState` in `providers.tsx` — at module scope it would
  be shared across server requests and leak one visitor's cache into another's render.
- `TokenCard` requires a `collection` prop. It is deliberately not optional: making it required
  is what surfaced every hardcoded-Genesis call site at compile time.
- Metadata is cached with `staleTime: Infinity` — it is immutable content on IPFS.
- The theme is resolved by a blocking inline script in `layout.tsx`, before first
  paint. React cannot do this: the markup is server-rendered, so a viewer who
  chose dark would get a full-screen white flash on every navigation.
- No stored theme choice stamps nothing on `<html>`, which leaves the page
  following `prefers-color-scheme`. Only an explicit choice writes `data-theme`.
- Gateway fetches are bounded to ~8–10 concurrent. Public gateways rate-limit, and stampeding
  them is slower than being polite.
- Creators never see the words IPFS, CID or base URI. Those are plumbing; hosting your own
  metadata lives behind an "Advanced" disclosure.
