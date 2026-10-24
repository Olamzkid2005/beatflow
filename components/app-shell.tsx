import Link from "next/link";

import { signOutOfGoogle } from "@/app/actions";
import { NavLinks } from "@/components/nav-links";
import { OnboardingExperience } from "@/components/onboarding-experience";
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-primary"
      >
        Skip to content
      </a>
      <div aria-hidden className="studio-atmosphere pointer-events-none fixed inset-0 -z-10" />

      <header className="sticky top-0 z-50 h-14 border-b border-surface-container-highest bg-surface-container-low/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/generate" className="group flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
                <Icon name="studio" className="h-4 w-4 text-primary" />
              </span>
              <span className="text-sm font-semibold tracking-wider text-on-surface">BEATFLOW</span>
            </Link>
            <NavLinks variant="sidebar" />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-2.5 py-1 font-mono text-[10px] text-on-surface-variant lg:flex">
              <StatusDot tone="success" />
              <span>Private studio</span>
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
                  className={buttonClass({ variant: "ghost", size: "sm", className: "min-w-11 px-2" })}
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

      <main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-3.5rem)] pb-20 lg:pb-8">
        {children}
      </main>

      <NavLinks variant="mobile" />
      <OnboardingExperience />
    </div>
  );
}
