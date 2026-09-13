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
