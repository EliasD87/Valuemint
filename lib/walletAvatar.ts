/**
 * The header's wallet avatar, as `/api/wallet-avatar` answers it and as the
 * browser keeps it between visits.
 */
export type WalletAvatar =
  | { kind: "revealed"; id: string; image: string; level?: string }
  | { kind: "sealed" }
  | { kind: "none" };

const KEY = "valuemint:avatar:";

/** The last answer for this wallet, from this browser, if it has one. */
export function keptAvatar(address: string): { avatar: WalletAvatar; at: number } | undefined {
  try {
    const raw = localStorage.getItem(KEY + address.toLowerCase());
    if (raw === null) return undefined;
    const kept = JSON.parse(raw) as { avatar?: WalletAvatar; at?: number };
    return kept.avatar !== undefined && typeof kept.at === "number" ? { avatar: kept.avatar, at: kept.at } : undefined;
  } catch {
    return undefined;
  }
}

export function keepAvatar(address: string, avatar: WalletAvatar): void {
  try {
    localStorage.setItem(KEY + address.toLowerCase(), JSON.stringify({ avatar, at: Date.now() }));
  } catch {
    /* Private window or storage full: the avatar is only ever a nicety. */
  }
}

/**
 * A wallet's own colours, for when it holds no Cybereator: two hues from the
 * address, so every wallet gets a stable picture of its own with no request.
 * Inline colours on purpose — like artwork, they are the wallet's, not the
 * theme's.
 */
export function addressGradient(address: string): string {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(12, "0");
  const a = parseInt(hex.slice(0, 4), 16) % 360;
  const b = (a + 50 + (parseInt(hex.slice(4, 8), 16) % 140)) % 360;
  const angle = parseInt(hex.slice(8, 10), 16) % 360;
  return `linear-gradient(${angle}deg, hsl(${a} 78% 62%), hsl(${b} 72% 46%))`;
}
