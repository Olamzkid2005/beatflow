import Link from "next/link";

import { signOutOfGoogle } from "@/app/actions";
import { NavLinks } from "@/components/nav-links";
import { Icon } from "@/components/ui/icon";
import { buttonClass, StatusDot } from "@/components/ui/primitives";

type AppShellUser = {
  name: string | null;
  email: string;
  image: string | null;
};

export function AppShell({ user, children }: { user: AppShellUser; children: React.ReactNode }) {
  const initial = (user.name?.trim() || user.email).slice(0, 1).toUpperCase();

  return (
    <div className="relative min-h-screen bg-surface-container-lowest text-on-surface">
      <div aria-hidden className="studio-atmosphere pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="studio-grid pointer-events-none fixed inset-0 -z-10 opacity-60" />

      <header className="fixed inset-x-0 top-0 z-50 h-14 border-b border-surface-container-highest bg-surface-container-low/95 backdrop-blur">
        <div className="flex h-full items-center justify-between gap-4 px-4 lg:px-7">
          <div className="flex min-w-0 items-center gap-5">
            <Link href="/generate" className="group flex items-center gap-2.5" aria-label="BeatFlow Studio home">
              <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl border border-primary/30 bg-primary/10">
                <span className="absolute inset-0 bg-linear-to-br from-primary-container/50 via-transparent to-tertiary/20" />
                <Icon name="studio" className="relative h-4 w-4 text-primary" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-[13px] font-semibold tracking-[0.18em] text-on-surface">BEATFLOW</span>
                <span className="mt-1 font-mono text-[9px] tracking-[0.22em] text-outline">STUDIO</span>
              </span>
            </Link>
            <NavLinks variant="header" />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-mono text-[10px] text-on-surface-variant lg:flex">
              <StatusDot />
              <span className="text-on-surface">Owner session</span>
              <span className="text-outline">·</span>
              <span>Google OAuth</span>
            </span>
            <div className="flex items-center gap-1 border-l border-surface-container-highest pl-2">
              <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-high">
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-semibold text-primary">{initial}</span>
                )}
              </div>
              <form action={signOutOfGoogle}>
                <button
                  type="submit"
                  className={buttonClass({ variant: "ghost", size: "sm", className: "px-2" })}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <Icon name="logout" className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-14 z-40 hidden w-60 flex-col justify-between border-r border-surface-container-highest bg-surface-container-low/85 p-3 backdrop-blur md:flex">
        <div className="flex flex-col gap-5">
          <div>
            <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-outline">
              Workstation
            </p>
            <NavLinks variant="sidebar" />
          </div>
          <div className="mx-1 rounded-xl border border-outline-variant bg-surface-container-lowest/80 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-outline">Pipeline</span>
              <span className="font-mono text-[11px] text-primary">M0</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-container-high">
              <div className="h-full w-1/3 rounded-full bg-primary" />
            </div>
            <p className="mt-2 text-xs leading-5 text-on-surface-variant">
              Owner upload proof is ready. Rendering and full publishing remain gated.
            </p>
          </div>
        </div>

        <div className="mx-1 flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest/80 p-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name="shield" className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium text-on-surface">Single-owner access</span>
            <span className="font-mono text-[10px] text-outline">FAIL-CLOSED</span>
          </div>
        </div>
      </aside>

      <div className="pt-14 md:pl-60">
        <main className="min-h-[calc(100vh-3.5rem)] pb-20 md:pb-0">{children}</main>
      </div>

      <NavLinks variant="mobile" />
    </div>
  );
}
