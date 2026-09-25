import Link from "next/link";
import { shortAddress } from "@/lib/format";

/**
 * A wallet address that opens that wallet.
 *
 * Every place the site names a person — a holder, a seller, a bidder, the two
 * sides of a sale — goes through here to `/address/…`, the lookup page, as if
 * the address had been pasted into search. Several used to be plain text you
 * could only copy, and the top-holders list sent people off to the explorer,
 * which shows transactions rather than what somebody collects. The explorer
 * is still one click away, on the lookup page itself.
 */
export function AddressLink({
  address,
  chars,
  label,
  className,
}: {
  address: `0x${string}` | string;
  /** Characters kept each side of the ellipsis; `shortAddress`'s default if absent. */
  chars?: number;
  /** Text to show instead of the address — a name, or "You". */
  label?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      className={`addr-link${className === undefined ? "" : ` ${className}`}`}
      href={`/address/${address}`}
      title={`${address} — see what this wallet holds`}
    >
      {label ?? shortAddress(address as `0x${string}`, chars)}
    </Link>
  );
}
