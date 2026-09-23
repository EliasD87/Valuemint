/**
 * What a new arrival actually needs to be told.
 *
 * One source for both the pill's panel and `/guide`, so the short version and
 * the long version cannot drift into saying different things.
 *
 * These are deliberately not a tour of the navigation. "Here is Explore, here
 * is Market" is discoverable by looking, and nobody is stuck on it. What people
 * are stuck on here is specific: a chain their wallet has never heard of, a
 * currency that pays gas, offers denominated in a wrapped token for reasons
 * that are invisible from the outside, and an approval before a first sale.
 * Every step below is one of those.
 *
 * ## Adding a clip
 *
 * Each step has an optional `clip`. Drop a short, silent screen recording and
 * a still frame from it into `public/guide/`, then fill the field in:
 *
 *   clip: { src: "/guide/offer.webm", poster: "/guide/offer.webp", alt: "…" }
 *
 * Keep them short and silent. UI footage compresses very well because most of
 * the frame never changes — ten seconds at 1280×720 in VP9 is a few hundred
 * kilobytes, which is the difference between this being worth shipping and
 * being the heaviest thing on the site. Nothing autoplays before the guide is
 * opened, and the poster is what a reader sees if the clip cannot or should
 * not play.
 *
 * A step with no clip renders as text, which is the state every one of them is
 * in today and a perfectly good one. **Prefer text that stays true over
 * footage that goes stale** — this interface changes most weeks, and a
 * recording showing a menu that has since moved teaches people something
 * wrong.
 */

export interface GuideClip {
  /** Silent WebM in `public/guide/`. */
  src: string;
  /** A still from it, shown before play and whenever motion is unwelcome. */
  poster: string;
  /** What the clip shows, for anyone who cannot see it. */
  alt: string;
}

export interface GuideStep {
  id: string;
  title: string;
  /** The whole point, said once. Short enough for the panel. */
  body: string;
  /** The part that does not fit in a panel. Only `/guide` shows it. */
  more?: string;
  clip?: GuideClip;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "chain",
    title: "Get on ValueChain",
    body:
      "ValueMint runs on ValueChain — chain 286623. Connect a wallet from the button in " +
      "the header and it will offer to add the network for you.",
    more:
      "SOSO is the chain's own coin, so it is both what pieces are priced in and what pays " +
      "the gas for every transaction. You need a little of it in your wallet before you can " +
      "buy, list or make an offer.",
  },
  {
    id: "buy",
    title: "Buy a piece",
    body:
      "Everything for sale is on the Listings page, and every collection has its own. " +
      "Prices are in SOSO, and buying is a single transaction.",
    more:
      "What you pay is what the listing says. The marketplace's 2.5% comes out of the " +
      "seller's proceeds rather than being added to the price, so the figure on the card is " +
      "the figure that leaves your wallet, plus gas.",
  },
  {
    id: "offer",
    title: "Offer less than the asking price",
    body:
      "Offers are made in WSOSO — wrapped SOSO. You can wrap and unwrap at any time, and " +
      "the two are always worth exactly the same.",
    more:
      "The wrapping is not a hoop for its own sake. An offer is an allowance, not an " +
      "escrow: the money stays in your wallet and only moves if the owner accepts, which " +
      "means nothing of yours is ever held by a contract while you wait. Plain SOSO cannot " +
      "do that, because giving an allowance is something only a token can do. It is the " +
      "same reason offers elsewhere are made in wrapped ETH.",
  },
  {
    id: "sell",
    title: "Sell what you hold",
    body:
      "Your portfolio lists everything you own here. Set a price and list it, and it " +
      "appears on the market straight away.",
    more:
      "The first time you list from a collection, your wallet asks for a one-time approval " +
      "so the marketplace can hand the piece over when it sells — after that, listing is " +
      "just the listing. The order itself is written to the chain rather than to a server, " +
      "so it costs a little gas and nobody can lose it. Cancelling is a transaction for the " +
      "same reason.",
  },
];
