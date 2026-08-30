"use client";

import { useCallback } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { maxUint256, parseEther, zeroAddress } from "viem";
import { ValueChainCollectionAbi, ValueChainMarketplaceAbi, deployment } from "@/config/contracts";
import { WsosoAbi } from "@/config/wsoso";
import { valuechain } from "@/config/chain";

const NATIVE = zeroAddress;
const WSOSO = deployment.wsoso;

/**
 * Every write below passes `chainId` explicitly.
 *
 * wagmi is configured with `chains: [valuechain]`, so a write against another
 * chain already fails - but that guarantee lives in wagmi's internals rather
 * than in this file, and the failure mode if it ever stopped holding is not a
 * revert. `buy` sends `value`, and on a chain where the marketplace address has
 * no code that call succeeds as a plain transfer to an address nobody controls:
 * silent loss, not an error.
 *
 * With `chainId` supplied, wagmi asserts the connector is on that chain and
 * throws `ChainMismatchError` otherwise. One line per call site, and the
 * guarantee is readable here.
 */

/**
 * The marketplace actions, and the approvals they depend on.
 *
 * Listing is two transactions, not one: the marketplace is non-custodial, so it
 * needs an ERC-721 approval before it can move anything. Hiding that would leave
 * people staring at a wallet prompt they were not told about, so `needsApproval`
 * is exposed and the UI asks for it explicitly.
 *
 * `collection` is required. It used to default to the Genesis address, which
 * meant a call site that forgot to pass one did not fail — it silently traded
 * against the wrong contract. A default that quietly picks a different
 * counterparty is not a convenience.
 */
export function useTrade(collection: `0x${string}` | undefined) {
  const { address } = useAccount();

  const { data: approvedForAll, refetch: refetchApproval } = useReadContract({
    address: collection,
    abi: ValueChainCollectionAbi,
    functionName: "isApprovedForAll",
    args: address === undefined ? undefined : [address, deployment.marketplace],
    query: { enabled: address !== undefined && collection !== undefined },
  });

  const { writeContract, data: hash, isPending: signing, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = useCallback(() => {
    if (collection === undefined) return;
    reset();
    writeContract({
      chainId: valuechain.id,
      address: collection,
      abi: ValueChainCollectionAbi,
      functionName: "setApprovalForAll",
      args: [deployment.marketplace, true],
    });
  }, [collection, reset, writeContract]);

  const list = useCallback(
    (tokenId: bigint, priceInSoso: string) => {
      if (collection === undefined) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "list",
        // Native SOSO, no expiry: the simplest listing, and the one the UI offers.
        args: [collection, tokenId, NATIVE, parseEther(priceInSoso), 0n],
      });
    },
    [collection, reset, writeContract],
  );

  const cancel = useCallback(
    (tokenId: bigint) => {
      if (collection === undefined) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "cancelListing",
        args: [collection, tokenId],
      });
    },
    [collection, reset, writeContract],
  );

  const buy = useCallback(
    (tokenId: bigint, price: bigint) => {
      if (collection === undefined) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "buy",
        /**
         * `price` is the figure the card showed, so it doubles as the buyer's
         * ceiling: the sale settles at or below what they were quoted, and
         * reverts with `PriceAboveMaximum` if the seller re-listed higher in
         * between. `NATIVE` is the currency they were quoted in — if the
         * listing switched to WSOSO, that reverts too rather than spending an
         * allowance the buyer never agreed to here.
         */
        args: [collection, tokenId, price, NATIVE],
        value: price,
      });
    },
    [collection, reset, writeContract],
  );

  // ------------------------------------------------------------------ offers

  /**
   * Offers are ERC-20 only, in WSOSO. The money stays in the bidder's wallet as
   * an allowance and moves only if the owner accepts — which is what lets an
   * offer stand without the marketplace ever holding anyone's funds.
   */
  const makeOffer = useCallback(
    (tokenId: bigint, priceInSoso: string, expiry: bigint) => {
      if (collection === undefined) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "makeOffer",
        args: [collection, tokenId, WSOSO, parseEther(priceInSoso), expiry],
      });
    },
    [collection, reset, writeContract],
  );

  const withdrawOffer = useCallback(
    (tokenId: bigint) => {
      if (collection === undefined) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "withdrawOffer",
        args: [collection, tokenId],
      });
    },
    [collection, reset, writeContract],
  );

  /**
   * `minPrice` and `expectedPaymentToken` are the contract's slippage guards. A
   * bidder can overwrite their own offer downward at any time, including in the
   * block before this one, so the price the owner saw is passed back and the
   * contract refuses if it no longer holds.
   */
  const acceptOffer = useCallback(
    (tokenId: bigint, bidder: `0x${string}`, minPrice: bigint) => {
      if (collection === undefined) return;
      reset();
      writeContract({
        chainId: valuechain.id,
        address: deployment.marketplace,
        abi: ValueChainMarketplaceAbi,
        functionName: "acceptOffer",
        args: [collection, tokenId, bidder, minPrice, WSOSO],
      });
    },
    [collection, reset, writeContract],
  );

  return {
    needsApproval: approvedForAll === false,
    refetchApproval,
    approve,
    list,
    cancel,
    buy,
    makeOffer,
    withdrawOffer,
    acceptOffer,
    signing,
    confirming,
    busy: signing || confirming,
    isSuccess,
    error,
    reset,
    hash,
  };
}

/**
 * The bidder's side of the WSOSO plumbing: how much they hold, how much the
 * marketplace may spend, and the two transactions that fix either.
 *
 * Kept separate from `useTrade` because it is the only part that is about a
 * currency rather than a token, and only the offer UI needs it.
 */
export function useWsoso(needed: bigint) {
  const { address } = useAccount();
  const on = { query: { enabled: address !== undefined, refetchInterval: 15_000 } };

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: WSOSO,
    abi: WsosoAbi,
    functionName: "balanceOf",
    args: address === undefined ? undefined : [address],
    ...on,
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: WSOSO,
    abi: WsosoAbi,
    functionName: "allowance",
    args: address === undefined ? undefined : [address, deployment.marketplace],
    ...on,
  });

  const { writeContract, data: hash, isPending: signing, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  /** Wrap native SOSO 1:1. WETH9's `deposit()` credits exactly `msg.value`. */
  const wrap = useCallback(
    (amountInSoso: string) => {
      reset();
      writeContract({
        chainId: valuechain.id,
        address: WSOSO,
        abi: WsosoAbi,
        functionName: "deposit",
        value: parseEther(amountInSoso),
      });
    },
    [reset, writeContract],
  );

  /**
   * An unlimited allowance, deliberately.
   *
   * The alternative is an approval transaction per offer, which for a bidder
   * placing several is three wallet prompts instead of one. The risk is bounded
   * differently here than for a general token: this allowance can only ever be
   * spent by `acceptOffer`, and only up to a price the bidder themselves signed.
   */
  const allow = useCallback(() => {
    reset();
    writeContract({
      chainId: valuechain.id,
      address: WSOSO,
      abi: WsosoAbi,
      functionName: "approve",
      args: [deployment.marketplace, maxUint256],
    });
  }, [reset, writeContract]);

  const held = (balance as bigint | undefined) ?? 0n;
  const approved = (allowance as bigint | undefined) ?? 0n;

  return {
    balance: held,
    allowance: approved,
    needsWrap: needed > 0n && held < needed,
    needsAllowance: needed > 0n && approved < needed,
    shortfall: needed > held ? needed - held : 0n,
    wrap,
    allow,
    refetch: () => {
      void refetchBalance();
      void refetchAllowance();
    },
    signing,
    confirming,
    busy: signing || confirming,
    isSuccess,
    error,
  };
}

/** What a sale at this price would pay out, straight from the contract. */
export function usePreviewSale(
  collection: `0x${string}` | undefined,
  tokenId: bigint | undefined,
  priceInSoso: string,
) {
  const price = (() => {
    try {
      return parseEther(priceInSoso || "0");
    } catch {
      return 0n;
    }
  })();

  const { data } = useReadContract({
    address: deployment.marketplace,
    abi: ValueChainMarketplaceAbi,
    functionName: "previewSale",
    args: tokenId === undefined || collection === undefined ? undefined : [collection, tokenId, price],
    query: { enabled: tokenId !== undefined && collection !== undefined && price > 0n },
  });

  const [proceeds, fee, , royalty] = (data ?? [0n, 0n, zeroAddress, 0n]) as [
    bigint,
    bigint,
    string,
    bigint,
  ];

  return { proceeds, fee, royalty, price };
}
