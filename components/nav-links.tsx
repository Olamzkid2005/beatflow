"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/components/ui/primitives";

const items: Array<{ href: string; label: string; shortLabel: string; icon: IconName }> = [
  { href: "/generate", label: "Studio", shortLabel: "Studio", icon: "studio" },
  { href: "/templates", label: "My Templates", shortLabel: "Templates", icon: "studio" },
  { href: "/batch", label: "Batch automation", shortLabel: "Batch", icon: "movie" },
  { href: "/history", label: "History", shortLabel: "History", icon: "history" },
  { href: "/settings", label: "Producer settings", shortLabel: "Settings", icon: "settings" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ variant }: { variant: "sidebar" | "mobile" }) {
  const pathname = usePathname();

  if (variant === "sidebar") {
    return (
      <nav className="flex flex-col gap-1" aria-label="Workspace">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-surface-container text-primary shadow-[inset_2px_0_0_var(--color-primary)]"
                  : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
              )}
            >
              <Icon name={item.icon} className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex h-16 items-stretch border-t border-surface-container-highest bg-surface-container-low/95 px-2 backdrop-blur md:hidden"
      aria-label="Mobile primary"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[10px] transition-colors",
              active
                ? "text-primary after:absolute after:top-0 after:h-0.5 after:w-6 after:rounded-full after:bg-primary"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <Icon name={item.icon} className="h-5 w-5" />
            <span>{item.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
