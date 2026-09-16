"use client";

import { useCallback, useEffect } from "react";
import { parseEther, type Address } from "viem";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { deployment } from "@/config/contracts";
import { WsosoAbi } from "@/config/wsoso";
import { SEAPORT } from "@/config/seaport";
import { valuechain } from "@/config/chain";

const WSOSO = deployment.wsoso;

/**
 * The bidder's side of the WSOSO plumbing: how much they hold, how much Seaport
 * may spend, and the two transactions that fix either.
 *
 * Bids are denominated in wrapped SOSO rather than native, and that is forced
 * rather than chosen. An offer has to stand over time without the marketplace
 * holding anyone's money, so the funds must stay in the bidder's wallet and move
 * on a pull. Native currency cannot be pulled; the only alternative would be an
 * escrow contract, which is a pot of other people's money with all the risk that
 * implies.
 *
 * `spender` defaults to Seaport because that is now the only contract that ever
 * spends this allowance. It stays a parameter so a call site can be explicit -
 * an allowance read against the wrong spender reports "approved" when nothing
 * is, and the bidder's offer is then unfillable with nothing on screen saying
 * why. That happened once already, with two contracts in play.
 */
export function useWsoso(needed: bigint, spender: Address = SEAPORT, alsoCover: bigint = 0n) {
  /**
   * The allowance must cover this action *and* everything already standing.
   *
   * `needed` alone drives the balance check — you only have to hold the money
   * for the bid you are placing now. The allowance is different: setting it to
   * just this bid would revoke the cover for bids already on chain.
   */
  const allowanceNeeded = needed + alsoCover;
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
    args: address === undefined ? undefined : [address, spender],
    ...on,
  });

  const { writeContract, data: hash, isPending: signing, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  /**
   * Re-read the moment a receipt lands, not on the 15s poll.
   *
   * This is the offer ladder's whole correctness. `needsWrap` and
   * `needsAllowance` are derived from these two reads, and they are what decide
   * which single button the form shows. Without this, wrapping succeeds and the
   * button keeps saying "Wrap 5 SOSO first" for up to fifteen seconds — so the
   * obvious response is to press it again and wrap twice. Exactly the shape of
   * the double-approval bug this project already paid for once, in the offer
   * ladder rather than the listing one.
   *
   * On the receipt, never on the click: a refetch fired from the click handler
   * runs before the wallet prompt is even answered.
   */
  useEffect(() => {
    if (!isSuccess) return;
    void refetchBalance();
    void refetchAllowance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, hash]);

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
   * An exact allowance. This used to be `maxUint256`, and that was a mistake.
   *
   * The reasoning for unlimited was that Seaport "can only spend it against an
   * order the bidder themselves put on chain". That is wrong twice over:
   *
   *   1. Seaport honours any order carrying the owner's valid EIP-712
   *      signature, not only ones they validated on chain. This app never asks
   *      for such a signature — but a phishing site can, and against an
   *      unlimited allowance one careless signature drains the whole balance.
   *   2. More immediately, an allowance is spent whenever the owner is the
   *      *fulfiller*, because the fulfiller pays every consideration item. A
   *      hostile order can name a line the display never showed. That is not
   *      theoretical: it is demonstrated settling against real Seaport in
   *      contracts/test/SeaportHostileOrders.test.ts, taking 500 WSOSO from
   *      somebody accepting a 0.5 WSOSO bid.
   *
   * `unsafeReason` in lib/seaport.ts stops this app displaying such an order at
   * all, and that is the primary defence. This is the second layer: even if a
   * hostile order reaches a wallet by some other route, it can only reach what
   * was actually approved.
   *
   * The cost is an approval transaction per offer rather than one ever. At
   * ValueChain gas that is a rounding error, and it is the right side of the
   * trade.
   */
  const allow = useCallback(() => {
    reset();
    writeContract({
      chainId: valuechain.id,
      address: WSOSO,
      abi: WsosoAbi,
      functionName: "approve",
      args: [spender, allowanceNeeded],
    });
  }, [allowanceNeeded, reset, spender, writeContract]);

  const held = (balance as bigint | undefined) ?? 0n;
  const approved = (allowance as bigint | undefined) ?? 0n;

  return {
    balance: held,
    allowance: approved,
    needsWrap: needed > 0n && held < needed,
    needsAllowance: allowanceNeeded > 0n && approved < allowanceNeeded,
    /** Exactly what `allow()` would set, so the UI can show the figure. */
    allowanceNeeded,
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
    /** The wrap/allow transaction, so the form can link to whichever step ran. */
    hash,
    /**
     * Clears the last receipt.
     *
     * Needed because `isSuccess` otherwise stays true for the life of the
     * component: once a bidder has wrapped, every later step in the ladder would
     * keep reporting the wrap's success alongside its own.
     */
    reset,
  };
}

/**
 * Whether this account can pay the marketplace fee when accepting a bid.
 *
 * Seaport pays the bid to the seller first and pulls the fee second, so the
 * seller never needs a WSOSO balance - but they do need an allowance, and
 * without it `fulfillOrder` reverts with nothing on screen to explain it. The
 * previous marketplace took its cut out of the money in flight, so this step did
 * not exist and is easy to forget.
 */
export function useCanPayFeeInWsoso(fee: bigint, alsoCover: bigint = 0n) {
  const wsoso = useWsoso(fee, SEAPORT, alsoCover);
  return {
    needsAllowance: wsoso.needsAllowance,
    allowanceNeeded: wsoso.allowanceNeeded,
    allow: wsoso.allow,
    busy: wsoso.busy,
    isSuccess: wsoso.isSuccess,
    error: wsoso.error,
    refetch: wsoso.refetch,
  };
}
