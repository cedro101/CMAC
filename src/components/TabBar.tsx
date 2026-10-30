"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/",
    label: "Today",
    icon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    href: "/progress",
    label: "Progress",
    icon: "M4 19V5M4 19h16M8 15l4-4 3 3 5-6",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: "M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4",
  },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="pb-safe flex shrink-0 border-t border-border bg-surface">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-14 flex-1 flex-col items-center justify-center gap-1 text-xs ${
              active ? "text-accent" : "text-muted"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
