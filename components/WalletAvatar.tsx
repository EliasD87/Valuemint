"use client";

import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { addressGradient, keepAvatar, keptAvatar, type WalletAvatar as Avatar } from "@/lib/walletAvatar";

/** How long an answer stands before it is asked again. Matches the route's edge cache. */
const FRESH_MS = 5 * 60_000;

/** Holds Cybereators, none opened yet: the sealed animation's cat, as a 3 KB still. */
const SEALED = "/avatars/cybereator-sealed.webp";

/**
 * The connected wallet's picture, with the live dot badged onto it (owner,
 * 2026-11-10): its rarest revealed Cybereator, the sealed cat if it holds only
 * sealed ones, or colours of its own from the address.
 *
 * Cheap by construction. Nothing is asked until a wallet is connected; the
 * last answer is kept in this browser, so a returning visitor's avatar paints
 * at once and is only re-asked after five minutes; the answer itself is cached
 * at the edge per address (app/api/wallet-avatar). Until there is an answer,
 * and whenever a picture fails, the address colours stand in, which cost no
 * request at all.
 */
export function WalletAvatar({ address, size }: { address: `0x${string}`; size: number }) {
  const { data } = useQuery({
    queryKey: ["wallet-avatar", address.toLowerCase()],
    staleTime: FRESH_MS,
    gcTime: 30 * 60_000,
    retry: 1,
    initialData: () => keptAvatar(address)?.avatar,
    initialDataUpdatedAt: () => keptAvatar(address)?.at,
    queryFn: async (): Promise<Avatar> => {
      const res = await fetch(`/api/wallet-avatar?address=${address}`);
      if (!res.ok) throw new Error(`wallet avatar answered ${res.status}`);
      const avatar = (await res.json()) as Avatar;
      keepAvatar(address, avatar);
      return avatar;
    },
  });

  /* A picture that fails to load falls back for good, not on every render. */
  const [broken, setBroken] = useState<string | undefined>(undefined);
  const src = data?.kind === "revealed" ? data.image : data?.kind === "sealed" ? SEALED : undefined;

  return (
    <span className="wallet-avatar" style={{ ["--glyph" as string]: `${size}px` } as CSSProperties} aria-hidden="true">
      {src !== undefined && broken !== src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a fixed 20-30px circle; nothing to optimise
        <img src={src} alt="" width={size} height={size} decoding="async" onError={() => setBroken(src)} />
      ) : (
        <span className="wallet-avatar-own" style={{ background: addressGradient(address) }} />
      )}
      <span className="wallet-dot" />
    </span>
  );
}
