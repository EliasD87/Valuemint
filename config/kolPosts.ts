/**
 * What the KOLs posted on X about their portraits — the "In their words" wall
 * on /kols.
 *
 * Our own cards, not X's embed: the embed loads a third-party script, renders
 * in X's look rather than ours, and goes blank when a post is deleted or X is
 * slow. A card built from the text keeps working whatever happens to the post.
 *
 * ## The one rule: their words, unedited
 *
 * `text` is copied exactly as posted — spelling, emoji, spacing and all. A
 * quote may be *shortened* (a greeting, a referral link, an unrelated line left
 * out) but never reworded. A post X translated is quoted in X's translation and
 * says so through `translated`; a post shown in its own language stays in it.
 *
 * Adding one: `kol` is the portrait number in config/kols.ts (the avatar, name
 * and handle come from there) and `date` is when it was posted. The cards link
 * nowhere, deliberately. The section stays hidden while this list is empty.
 */

export interface KolPost {
  /** Portrait number in config/kols.ts. */
  kol: number;
  /** Their words, as posted. Line breaks as `\n`. */
  text: string;
  /** When it was posted, YYYY-MM-DD. */
  date: string;
  /** Set when the text is X's translation: the language it was written in. */
  translated?: string;
}

/** Top to bottom in this order; each goes to whichever side is shorter. */
export const KOL_POSTS: readonly KolPost[] = [
  {
    kol: 5,
    date: "2026-09-26",
    text: "This is really beautiful.\n\nAn NFT made specially for active SoDEX community.\n\nA very big thanks @sodex_official for the recognition.\n\nAnd nice work @eliasing__",
  },
  {
    kol: 1,
    date: "2026-09-26",
    translated: "Japanese",
    text: "The custom KOL NFT I got made is ridiculously cute too. The fluffy vibe is the best! 🐱\nPlus, thankfully, I was KOL #1 ✨",
  },
  {
    kol: 25,
    date: "2026-09-27",
    text: "💜 What an incredible surprise from the SoDEX community!\n\nI’m really happy to be one of the selected members of the SoDEX Community Collection and to receive a custom 1/1 NFT, created specifically for each selected community member. 🏆",
  },
  {
    kol: 11,
    date: "2026-09-28",
    text: "Big thanks to @eliasing__ for the SoDEX KOL recognition. Honored to be part of the crew 🤝",
  },
  {
    kol: 36,
    date: "2026-09-28",
    translated: "Turkish",
    text: "I'm proud to be part of the #ValueMint @sodex_official Community Collection today.\n\nThe journey I've spent sharing, trading, and contributing in the SoDEX community has now been immortalized with a 1/1 exclusive portrait NFT. 🖼️",
  },
  {
    kol: 12,
    date: "2026-09-27",
    translated: "Japanese",
    text: "Thank you for creating a unique NFT for me,\nso I've changed my profile picture 😆",
  },
  {
    kol: 34,
    date: "2026-09-28",
    text: "Just want to give a big shout-out to @eliasing__ Thank you for creating this wonderful piece for me on valuemint.store/kols",
  },
  {
    kol: 28,
    date: "2026-09-27",
    text: "Looks like family photo here @eliasing__ , nice design 🙌",
  },
  {
    kol: 16,
    date: "2026-09-28",
    text: "SoDEXの投稿を何本かさせて頂いており、SoDEX Japan Squadにも参加していたら、ValueMintのKOLカスタムNFT作ってもらえた、なんか可愛いぞｗ",
  },
  {
    kol: 6,
    date: "2026-09-26",
    translated: "Chinese",
    text: "You've made it\nNow you're on the chain too\n@sodex_official\nThanks @eliasing__",
  },
  {
    kol: 32,
    date: "2026-09-28",
    text: "ありがたいことにSoDEXの紹介投稿をこまめにしていたことで、KOLとして認められNFTを作ってもらいました。",
  },
  {
    kol: 31,
    date: "2026-09-26",
    text: "Thank you @sodex_official team\n\nGuys, SoDEX is cooking something big for people who have been constantly supporting SoDEX and @SoSoValueCrypto from day one",
  },
  {
    kol: 8,
    date: "2026-09-28",
    text: "@eliasing__ designed NFTs for individuals who have played a significant role in the SoDEX community.",
  },
];
