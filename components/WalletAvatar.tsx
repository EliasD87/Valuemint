"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WalletMark } from "@/components/WalletMark";
import { keepAvatar, keptAvatar, type WalletAvatar as Avatar } from "@/lib/walletAvatar";
import "./WalletAvatar.css";

/** How long an answer stands before it is asked again. Matches the route's edge cache. */
const FRESH_MS = 5 * 60_000;

/** Holds Cybereators, none opened yet: the sealed animation's cat, as a 3 KB still. */
const SEALED = "/avatars/cybereator-sealed.webp";

/**
 * A wallet's picture (owner, 2026-11-10): its rarest revealed Cybereator, the
 * sealed cat if it holds only sealed ones, or its `WalletMark`, the disc drawn
 * from its own address, for everyone else. One component for the header pill
 * and the portfolio, so a wallet wears the same face in both.
 *
 * Cheap by construction. The last answer is kept in this browser, so a
 * returning visitor's picture paints at once and is only re-asked after five
 * minutes; the answer itself is cached at the edge per address
 * (app/api/wallet-avatar). Until there is an answer, and whenever a picture
 * fails, the WalletMark stands in, which costs no request at all.
 */
export function WalletAvatar({
  address,
  size,
  dot = false,
}: {
  address: `0x${string}`;
  size: number;
  /** The live badge, for the connected wallet in the header. */
  dot?: boolean;
}) {
  const key = ["wallet-avatar", address.toLowerCase()];
  const client = useQueryClient();

  /*
   * The kept answer goes in after mount, not as `initialData`. A portfolio
   * page (/address/…) renders on the server, where there is no localStorage:
   * read during the first render, the browser would draw a picture where the
   * server drew the WalletMark, and React would throw the server's HTML away.
   * After mount it is one frame later and still asks nothing while fresh.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const kept = keptAvatar(address);
    if (kept !== undefined && client.getQueryData(key) === undefined) {
      client.setQueryData(key, kept.avatar, { updatedAt: kept.at });
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is the address
  }, [address, client]);

  const { data } = useQuery({
    queryKey: key,
    enabled: ready,
    staleTime: FRESH_MS,
    gcTime: 30 * 60_000,
    retry: 1,
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
        // eslint-disable-next-line @next/next/no-img-element -- a fixed small circle; nothing to optimise
        <img src={src} alt="" width={size} height={size} decoding="async" onError={() => setBroken(src)} />
      ) : (
        <WalletMark address={address} size={size} />
      )}
      {dot ? <span className="wallet-dot" /> : null}
    </span>
  );
}
