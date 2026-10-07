import { DRIVER_BADGE_CLASS, type DriverBadge } from "@/lib/scheduling";

/** Compact per-driver status chip, used in driver pickers and driver cards. */
export function DriverStatusBadge({ badge, className }: { badge: DriverBadge; className?: string }) {
  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
        DRIVER_BADGE_CLASS[badge.kind]
      } ${className ?? ""}`}
    >
      {badge.label}
    </span>
  );
}
