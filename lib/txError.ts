/**
 * Turning a wallet or RPC failure into a sentence somebody can act on.
 *
 * Wallet errors arrive as hundreds of characters of RPC transcript, and the
 * habit everywhere was to print the first 180 of them. That is fine for a
 * revert whose first line names the reason and useless for the two failures
 * people actually hit.
 *
 * Both were seen in production on the same afternoon:
 *
 *   "Requested resource not available. Request Arguments: from: 0x08… to:
 *    0x02… data: 0x51cff8d9…"
 *
 * which is a node saying it has never heard of that contract — because the
 * wallet was pointed at a local dev chain — and reads to the person holding it
 * like their money has vanished. And:
 *
 *   "The current chain of the wallet (id: 31337) does not match the target
 *    chain for the transaction (id: 286623 – undefined)"
 *
 * which is correct, and names neither network in a way anybody recognises.
 *
 * So the mapping below is deliberately short: the cases a person can do
 * something about, said in the terms they would use. Everything else still
 * falls through to the first line of the original, because inventing a friendly
 * message for an unknown failure is worse than showing the real one.
 */

const CHAIN_NAME = "ValueChain";

/**
 * The network's public server that did not refuse a burst when its sibling did
 * (2026-11-01: 60 at once, all answered; rpc.valuechain.xyz turned 4 away with
 * -32005). Named in the message so a person can point their wallet at it.
 */
export const STEADY_RPC = "https://mainnet.valuechain.xyz";

/**
 * JSON-RPC -32005 and its HTTP 429 wording: a server over its limit at that
 * moment. Nothing reached the chain, which is what makes it safe to retry
 * (hooks/useSeaportTrade.ts, `useSeaportFill`).
 *
 * 429 only as an HTTP status, never as three digits anywhere (2026-11-01). A
 * wallet's error carries the whole order — calldata, addresses, a 77-digit
 * salt, the token id — and a bare "429" would turn up in that by chance. The
 * first version wrote `\b429\b` with literal backspace characters, so it
 * matched nothing at all and a plain HTTP 429 went unrecognised.
 */
const RATE_LIMITED = new RegExp(
  [
    "exceeds defined limit",
    "limit exceeded",
    "rate[- ]limit",
    "too many requests",
    // The code itself, with its minus sign, which no calldata or salt carries.
    "(?<![\\w.])-32005(?!\\d)",
    // viem's "Status: 429", or "status": 429 in a JSON body.
    'status"?\\s*[:=]?\\s*"?429(?!\\d)',
  ].join("|"),
  "i",
);

/**
 * True when a server turned the request away for being busy, and so nothing
 * reached the chain. Never true for a rejection: someone who pressed Reject
 * must not see their wallet open again.
 */
export function isRateLimited(message: string): boolean {
  return !isRejection(message) && RATE_LIMITED.test(message);
}

/** Matched against the whole message, which is where wagmi puts the detail. */
const RULES: Array<{ test: RegExp; say: string }> = [
  {
    // wagmi's ChainMismatchError, and the viem variants of the same thing.
    test: /does not match the target chain|ChainMismatch|chain of the wallet/i,
    say: `Your wallet is on a different network. Switch it to ${CHAIN_NAME} and try again.`,
  },
  {
    /**
     * JSON-RPC -32002. On a wallet it means a request is already open; on a
     * node it means the thing being asked about is not there. Both are true
     * often enough that the message covers them together rather than guessing.
     */
    test: /requested resource not available|-32002|resource unavailable/i,
    say:
      `Your wallet could not reach that contract. Check it is on ${CHAIN_NAME}, ` +
      "and that no other wallet request is still waiting.",
  },
  {
    /**
     * The wallet numbered this transaction the same as the one just sent
     * (2026-10-09, minting twice in a row): its node had not yet seen the first
     * one land, so it handed out the same nonce and the network refused it. The
     * raw text, "nonce too low: next nonce 517, tx nonce 516", reads like a
     * contract failure; nothing was sent, and a retry a moment later works.
     */
    test: /nonce too low|nonce has already been used|NONCE_EXPIRED|nonce.{0,20}too low/i,
    say:
      "Your wallet reused the number of your last transaction because its network had not caught up yet. " +
      "Nothing was sent and nothing was charged. Wait a few seconds and try again.",
  },
  {
    /**
     * JSON-RPC -32005, "Request exceeds defined limit" (2026-10-20, buying a
     * Treasure Box: refused twice, then went through on the third press). A node
     * — usually the wallet's own connection to the chain — turned the request
     * away for being over its limit at that moment. Nothing reached the chain;
     * the address's history showed only the purchase that finally worked.
     */
    test: RATE_LIMITED,
    /**
     * By the time a purchase shows this, the site has already retried it twice.
     * So the advice is the lasting fix as well as the immediate one: the
     * wallet's own connection is what keeps being refused.
     */
    say:
      `${CHAIN_NAME}'s network server was too busy and turned the request away. ` +
      "Nothing was sent and nothing was charged. Wait a moment and try again. " +
      `If it keeps happening, set your wallet's ${CHAIN_NAME} RPC to ${STEADY_RPC}.`,
  },
  {
    test: /insufficient funds|exceeds the balance|gas required exceeds/i,
    say: "Not enough SOSO in this wallet to cover the amount and the gas.",
  },
  {
    test: /NothingToWithdraw/,
    say: "There is nothing to withdraw — the balance is already zero.",
  },
  {
    test: /MarketplaceNotApproved/,
    say: "The marketplace needs permission to move this piece first. Approve it, then try again.",
  },
  {
    test: /NotTokenOwner/,
    say: "This wallet does not hold that piece any more.",
  },
  {
    test: /\bNoOffer\b/,
    say: "That offer is no longer standing — it was withdrawn, accepted or replaced.",
  },
  {
    test: /OfferExpired/,
    say: "That offer has expired.",
  },
  {
    test: /OfferBelowMinimum/,
    say: "The bidder lowered their offer while you were looking at it, so nothing was sold.",
  },
  {
    test: /ListingExpired/,
    say: "That listing has expired. The seller needs to list it again.",
  },
  {
    test: /NotListed/,
    say: "That piece is not listed for sale any more.",
  },
  {
    test: /SelfTrade/,
    say: "You cannot trade with yourself.",
  },
  {
    test: /MetadataIsFrozen/,
    say: "This collection's artwork is frozen and cannot be changed.",
  },
  {
    test: /WalletLimitReached/,
    say: "This wallet has already minted as many as the collection allows.",
  },
  {
    test: /PublicMintDisabled/,
    say: "Public minting is closed for this collection.",
  },
  {
    test: /MaxSupplyReached|PublicAllocationExhausted/,
    say: "This collection is sold out.",
  },

  /* ------------------------------------------------------------ KOL claim */
  {
    test: /\bAlreadyClaimed\b/,
    say: "This portrait has already been claimed. It went to the wallet on the list, so check that wallet.",
  },
  {
    test: /\bClaimEnded\b/,
    say: "Claiming has closed. Reach out to us and we will sort it out.",
  },
  {
    test: /\bNotOpen\b/,
    say: "Claiming has not opened yet. Check back soon.",
  },
  {
    test: /\bNoRecipient\b/,
    say: "No wallet is on the list for this portrait yet.",
  },

  /* ---------------------------------------------------------------- Seaport
   * Losing a race is the normal way a trade fails on a marketplace, and until
   * the ABI carried Seaport's errors none of these could be decoded at all —
   * viem produced a message ending in a bare selector and the first line of it
   * said nothing. Every rule below is a *concurrency* outcome: somebody else
   * got there first, or the order stopped being available between the render
   * and the click. They are expected, they are not the user's mistake, and the
   * wording says so.
   *
   * These are matched ahead of nothing and after the wallet-level rules,
   * because a chain mismatch or a rejection is a better explanation when both
   * are present.
   */
  {
    test: /OrderAlreadyFilled/,
    say:
      "Somebody else bought this first. Your transaction reverted, so nothing " +
      "was charged beyond gas, and you still hold what you held.",
  },
  {
    test: /OrderIsCancelled/,
    say:
      "The person who made this order cancelled it before your transaction " +
      "landed. Nothing was exchanged.",
  },
  {
    test: /OrderPartiallyFilled/,
    say:
      "Someone took part of this lot while you were confirming, so the amount " +
      "you asked for is no longer available. Try again for what is left.",
  },
  {
    test: /InvalidTime/,
    say: "This order expired before your transaction landed.",
  },
  {
    test: /NoSpecifiedOrdersAvailable/,
    say: "That order is no longer available to fill.",
  },
  {
    test: /InsufficientNativeTokensSupplied|InvalidMsgValue/,
    say:
      "The amount sent did not match the order's price. The price may have " +
      "changed since this page loaded — reload and try again.",
  },
  {
    test: /ConsiderationNotMet/,
    say:
      "This order asks for something the transaction did not provide. Reload " +
      "the page so you are looking at its current terms.",
  },
  {
    test: /BadFraction|PartialFillsNotEnabledForOrder/,
    say: "This listing cannot be split into the quantity you asked for.",
  },
  {
    test: /InvalidCanceller/,
    say: "Only the account that made an order can cancel it.",
  },
  {
    test: /InvalidSigner|BadSignature/,
    say: "This order could not be authorised. It may have been replaced or withdrawn.",
  },
  {
    /**
     * Seaport reverts here when the offerer no longer holds the token or no
     * longer approves Seaport — the stale-listing case the order book tries to
     * hide with `fillable`, surfacing when the UI's read was a moment behind.
     */
    test: /ERC721: caller is not token owner|ERC1155: caller is not|NOT_AUTHORIZED|TRANSFER_FROM_FAILED|UNAUTHORIZED/i,
    say:
      "The seller no longer holds this piece, or has withdrawn the marketplace's " +
      "permission to move it. The listing is stale.",
  },
];

/** True when the person chose to stop, which is not a failure. */
export function isRejection(message: string): boolean {
  return /rejected|denied|User denied|User rejected/i.test(message);
}

/**
 * @param message the error's `message`, unmodified
 * @param max     how much of an unrecognised message to keep
 */
export function explainTxError(message: string, max = 180): string {
  if (isRejection(message)) return "You cancelled that in your wallet.";

  for (const rule of RULES) {
    if (rule.test.test(message)) return rule.say;
  }

  // Nothing matched. The first line is the only part of an RPC transcript that
  // ever carries meaning, so show that rather than paraphrasing.
  const first = message.split("\n")[0]?.trim() ?? "";
  return first === "" ? "That transaction failed." : first.slice(0, max);
}
