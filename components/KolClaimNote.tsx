import { KOLS_CLAIM_CONTACT } from "@/config/kols";
import "./KolClaimNote.css";

/**
 * One line on the KOL collection page for the people in it: DM your wallet
 * address to get on the claim list. The whole line is the link, to the X
 * account that collects the addresses.
 */
export function KolClaimNote() {
  return (
    <a className="kcn" href={KOLS_CLAIM_CONTACT.url} target="_blank" rel="noreferrer noopener">
      <span className="kcn-x" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.8 2h6.4l4.4 5.8L18.9 2Zm-1.1 18.1h1.7L8.3 3.8H6.5l11.3 16.3Z" />
        </svg>
      </span>
      <span className="kcn-text">
        Part of this collection? <b>DM your wallet address</b> to claim your NFT
      </span>
      <span className="kcn-handle">
        @{KOLS_CLAIM_CONTACT.handle}
        <span className="kcn-arrow" aria-hidden="true">
          →
        </span>
      </span>
    </a>
  );
}
