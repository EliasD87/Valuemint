import type { Connector } from "wagmi";

/**
 * Wallets this site will not connect through.
 *
 * Phantom (2026-09-25). Its EVM side works only on the networks Phantom itself
 * lists and cannot add ValueChain, so a connection through it can never reach
 * the right network: the header said "Wrong network — switch in Phantom" and
 * the switch could never happen. It also makes itself the browser's default
 * wallet, so a connection meant for MetaMask could land in Phantom without
 * anybody choosing it.
 *
 * Refused rather than explained: there is nothing a Phantom user can do on
 * this chain, so the right move is to never connect it and say why.
 */

/** Phantom's EIP-6963 id, which wagmi uses as the connector id. */
const PHANTOM_RDNS = "app.phantom";

export const REFUSED_NOTE =
  "Phantom can't be used here: it doesn't support ValueChain. Connect with MetaMask or another wallet.";

/** A named (EIP-6963) connector this site will not offer or keep. */
export function isRefusedNamed(c: Pick<Connector, "id" | "name">): boolean {
  return c.id === PHANTOM_RDNS || /phantom/i.test(c.name);
}

/**
 * The generic `injected` connector is whichever wallet claimed
 * `window.ethereum` — Phantom, when it is set as the default.
 */
export function injectedIsRefused(): boolean {
  if (typeof window === "undefined") return false;
  const eth = (window as { ethereum?: { isPhantom?: boolean } }).ethereum;
  return eth?.isPhantom === true;
}

/** Either kind: the connector a live connection is going through. */
export function isRefusedConnector(c: Pick<Connector, "id" | "name">): boolean {
  return isRefusedNamed(c) || (c.id === "injected" && injectedIsRefused());
}
