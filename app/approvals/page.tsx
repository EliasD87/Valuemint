"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect } from "wagmi";
import { useApprovals, useRevoke, type Approval } from "@/hooks/useApprovals";
import { TxResult } from "@/components/TxResult";
import { deployment } from "@/config/contracts";
import { formatCount, shortAddress } from "@/lib/format";
import "@/styles/approvals.css";

/**
 * What this wallet has let other contracts move, and how to stop them.
 *
 * The app asked every seller for `setApprovalForAll` and never offered a way
 * back, so approvals granted to two replaced marketplaces and one paused one
 * are all still live. Nothing here is reversible by us — an approval lives on
 * the collection contract and only its owner can withdraw it — which is exactly
 * why the control has to exist in the interface that asked for it.
 */
export default function Approvals() {
  const { address } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { approvals, retired, isLoading, connected, refetch } = useApprovals();

  /** Which row is being revoked, so the banner belongs to one action. */
  const [active, setActive] = useState<string | undefined>(undefined);

  const after = useCallback(() => void refetch(), [refetch]);
  const revoke = useRevoke(after);

  /**
   * Wallet state does not exist during server rendering, so `connected` is
   * always false there. Rendering the connected tree on the client against a
   * server tree that showed the prompt is the hydration mismatch this page
   * would otherwise throw. Same guard as /manage, for the same reason.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !connected) {
    return (
      <section className="page section market-empty">
        <p className="eyebrow">Approvals</p>
        <h2>What can move your NFTs</h2>
        <p className="muted">Connect a wallet to see what it has approved.</p>
        <button
          className="btn btn-primary btn-lg"
          disabled={isPending}
          onClick={() => {
            const injected = connectors.find((c) => c.id === "injected");
            if (injected !== undefined) connect({ connector: injected });
          }}
        >
          {isPending ? "Check your wallet…" : "Connect wallet"}
        </button>
      </section>
    );
  }

  return (
    <section className="page section">
      <div className="head">
        <div>
          <p className="eyebrow">Approvals</p>
          <h2>What can move your NFTs</h2>
        </div>
        <Link className="head-link" href="/portfolio">
          Your pieces &rarr;
        </Link>
      </div>

      {/* One line. The rows carry the detail — a page that has to explain
          itself in a paragraph before showing anything is a page nobody
          reads. */}
      <p className="lede approvals-lede">
        Each of these can move every token you hold in that collection, until you revoke it.
      </p>

      <TxResult
        hash={revoke.hash}
        confirming={revoke.confirming}
        success={revoke.isSuccess}
        error={revoke.error}
        successLabel="Approval revoked"
      />

      {isLoading && approvals.length === 0 ? (
        <div className="approvals-list">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="approvals-row card">
              <div className="skeleton" style={{ height: "3.5rem" }} />
            </div>
          ))}
        </div>
      ) : approvals.length === 0 ? (
        <div className="market-empty">
          <h3>Nothing is approved.</h3>
          <p className="muted">Nothing can move what this wallet holds.</p>
          <p className="muted mono">{address}</p>
        </div>
      ) : (
        <>
          {retired.length > 0 ? (
            <p className="approvals-warn">
              <strong>
                {retired.length === 1
                  ? "1 approval is to a marketplace nothing uses."
                  : `${retired.length} approvals are to marketplaces nothing uses.`}
              </strong>{" "}
              Revoking costs gas and breaks nothing.
            </p>
          ) : null}

          <div className="approvals-list">
            {approvals.map((a) => (
              <Row
                key={`${a.collection.address}-${a.operator.address}`}
                approval={a}
                busy={revoke.busy && active === rowKey(a)}
                anyBusy={revoke.busy}
                onRevoke={() => {
                  setActive(rowKey(a));
                  revoke.revoke(a.collection.address, a.operator.address);
                }}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function rowKey(a: Approval): string {
  return `${a.collection.address}-${a.operator.address}`;
}

function Row({
  approval,
  busy,
  anyBusy,
  onRevoke,
}: {
  approval: Approval;
  busy: boolean;
  anyBusy: boolean;
  onRevoke: () => void;
}) {
  const { collection, operator, held } = approval;
  const retired = operator.standing === "retired";

  return (
    <div className={`approvals-row card ${retired ? "is-retired" : ""}`}>
      <div className="approvals-main">
        <div className="min-0">
          <b>{collection.name}</b>
          <div className="approvals-sub">
            can be moved by{" "}
            <a
              href={`${deployment.explorer}/address/${operator.address}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              {operator.name}
            </a>{" "}
            <span className="mono dim">{shortAddress(operator.address, 4)}</span>
          </div>
        </div>
        <span className={`chip ${retired ? "chip-warn" : ""}`}>
          {retired ? "Not in use" : "In use"}
        </span>
      </div>

      <p className="approvals-why">{operator.why}</p>

      <div className="approvals-foot">
        {/* The number is the point: an approval over nothing is a different
            decision from an approval over everything you own. */}
        <span className="approvals-exposure">
          {held === 0n ? (
            <>Nothing held &mdash; covers anything you receive</>
          ) : (
            <>
              <b>{formatCount(held)}</b> {held === 1n ? "piece" : "pieces"}
            </>
          )}
        </span>
        <button
          className={retired ? "btn btn-primary" : "btn"}
          disabled={anyBusy}
          onClick={onRevoke}
        >
          {busy ? "Revoking…" : "Revoke"}
        </button>
      </div>
    </div>
  );
}
