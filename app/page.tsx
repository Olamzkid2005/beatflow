import type { Metadata } from "next";
import Link from "next/link";

import { signInWithGoogle, signOutOfGoogle } from "@/app/actions";
import { auth } from "@/auth";
import { Icon } from "@/components/ui/icon";
import { Badge, buttonClass, Card, StatusDot } from "@/components/ui/primitives";
import { isOwner } from "@/lib/owner";

export const metadata: Metadata = {
  title: { absolute: "Connect · BeatFlow" },
};

export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user);
  const owner = isOwner(session?.user?.email);
  const expired = Boolean(owner && session?.error);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative min-h-screen overflow-hidden bg-surface-container-lowest text-on-surface"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-primary"
      >
        Skip to content
      </a>
      <div aria-hidden className="studio-atmosphere pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="studio-grid pointer-events-none fixed inset-0 -z-10 opacity-60" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-primary/30 bg-primary/10">
            <span className="absolute inset-0 bg-linear-to-br from-primary-container/50 via-transparent to-tertiary/20" />
            <Icon name="studio" className="relative h-4 w-4 text-primary" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-[0.18em]">BEATFLOW</span>
            <span className="mt-1 font-mono text-[9px] tracking-[0.22em] text-outline">STUDIO</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Badge
            tone={owner ? (expired ? "danger" : "success") : "neutral"}
            className="hidden sm:inline-flex"
          >
            <StatusDot tone={owner ? (expired ? "danger" : "success") : "muted"} />
            {owner ? (expired ? "Reconnect needed" : "Studio online") : "Private studio"}
          </Badge>
          {owner && !expired ? (
            <Link href="/generate" className={buttonClass({ variant: "outline", size: "sm" })}>
              Open studio
              <Icon name="arrowRight" className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-outline">
              {owner ? "Google session expired" : "Owner access only"}
            </span>
          )}
        </div>
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-6xl gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:gap-16 lg:pt-14">
        <div>
          <Badge tone="primary">
            <StatusDot />
            Owner-only studio
          </Badge>

          <h1 className="mt-6 max-w-2xl text-balance text-4xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-6xl">
            Your beats.
            <br />
            <span className="text-primary">Your channel.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-on-surface-variant sm:text-lg">
            A private publishing desk for rendered beat videos. Prepare the file, set the
            release, and send it straight to YouTube from the browser.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {!signedIn ? (
              <form action={signInWithGoogle}>
                <button type="submit" className={buttonClass({ size: "lg", className: "pr-4" })}>
                  <Icon name="youtube" className="h-4 w-4" />
                  Continue with Google
                  <Icon name="arrowRight" className="ml-1 h-4 w-4" />
                </button>
              </form>
            ) : owner ? (
              expired ? (
                <form action={signInWithGoogle}>
                  <button type="submit" className={buttonClass({ size: "lg", className: "pr-4" })}>
                    <Icon name="refresh" className="h-4 w-4" />
                    Reconnect Google
                  </button>
                </form>
              ) : (
                <Link href="/generate" className={buttonClass({ size: "lg", className: "pr-4" })}>
                  Open studio
                  <Icon name="arrowRight" className="ml-1 h-4 w-4" />
                </Link>
              )
            ) : (
              <form action={signOutOfGoogle}>
                <button type="submit" className={buttonClass({ variant: "outline", size: "lg" })}>
                  Sign out and switch account
                </button>
              </form>
            )}
            <span className="flex items-center gap-2 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-outline">
              <Icon name="shield" className="h-3.5 w-3.5 text-primary" />
              Single-owner workspace
            </span>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[10px] uppercase tracking-[0.14em] text-outline">
            {["Browser render", "Resumable upload", "Scheduled release"].map((label) => (
              <span key={label} className="inline-flex items-center gap-2">
                <Icon name="check" className="h-3.5 w-3.5 text-primary" />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="relative overflow-hidden p-5 sm:p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
            />
            <div className="relative flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">
                  Access
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">
                  {owner ? "Studio unlocked" : signedIn ? "Account not recognized" : "Connect your channel"}
                </h2>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Icon name={owner ? "check" : signedIn ? "alert" : "shield"} className="h-5 w-5" />
              </span>
            </div>

            {!signedIn ? (
              <>
                <p className="relative mt-3 text-sm leading-6 text-on-surface-variant">
                  Sign in with the Google account that owns the target channel. No other
                  account can reach the upload desk.
                </p>
                <form action={signInWithGoogle} className="relative mt-5">
                  <button type="submit" className={buttonClass({ size: "lg", className: "w-full" })}>
                    <Icon name="youtube" className="h-4 w-4" />
                    Continue with Google
                  </button>
                </form>
                <div className="relative mt-4 flex items-start gap-2.5 rounded-xl border border-outline-variant/70 bg-surface-container-lowest/70 p-3">
                  <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-outline" />
                  <p className="text-xs leading-5 text-on-surface-variant">
                    Requests only the permissions needed to read your channel and upload a
                    release. Google tokens stay in the encrypted server session.
                  </p>
                </div>
              </>
            ) : owner ? (
              <>
                <div className="relative mt-5 flex items-center gap-3 rounded-xl border border-outline-variant/70 bg-surface-container-lowest/70 p-3">
                  <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-high">
                    {session?.user?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={session.user.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Icon name="user" className="h-4 w-4 text-primary" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {session?.user?.name ?? "Channel owner"}
                    </p>
                    <p className="truncate font-mono text-[10px] text-outline">
                      {session?.user?.email}
                    </p>
                  </div>
                  <StatusDot tone={expired ? "danger" : "success"} />
                </div>

                {expired ? (
                  <div role="alert" className="relative mt-3 rounded-xl border border-error/25 bg-error-container/15 p-3">
                    <p className="text-xs leading-5 text-error">
                      Google access expired or was revoked. Reconnect before uploading.
                    </p>
                    <form action={signInWithGoogle} className="mt-3">
                      <button type="submit" className={buttonClass({ size: "sm" })}>
                        Reconnect Google
                      </button>
                    </form>
                  </div>
                ) : null}

                <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
                  <Link href="/generate" className={buttonClass({ size: "lg", className: "w-full" })}>
                    Open studio
                    <Icon name="arrowRight" className="h-4 w-4" />
                  </Link>
                  <form action={signOutOfGoogle}>
                    <button
                      type="submit"
                      className={buttonClass({ variant: "outline", size: "lg", className: "w-full" })}
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <>
                <div className="relative mt-4 flex items-start gap-3 rounded-xl border border-error/25 bg-error-container/15 p-3">
                  <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-error" />
                  <div>
                    <p className="text-sm font-medium text-error">Wrong Google account</p>
                    <p className="mt-1 text-xs leading-5 text-on-surface-variant">
                      Signed in as{" "}
                      <span className="font-mono text-on-surface">{session?.user?.email}</span>.
                      This studio only accepts its configured owner.
                    </p>
                  </div>
                </div>
                <form action={signOutOfGoogle} className="relative mt-4">
                  <button
                    type="submit"
                    className={buttonClass({ variant: "outline", size: "lg", className: "w-full" })}
                  >
                    Sign out and switch account
                  </button>
                </form>
              </>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-outline">
                Pipeline
              </p>
              <Badge tone="success">
                <StatusDot tone="success" />
                Ready
              </Badge>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {[
                ["Owner session", "Verified", true],
                ["Channel access", "YouTube Data API", true],
                ["Resumable upload", "Browser → Google", true],
                ["Scheduled release", "Private until publish", false],
              ].map(([label, detail, complete]) => (
                <li key={String(label)} className="flex items-center gap-3">
                  <span
                    className={
                      complete
                        ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary"
                        : "flex h-5 w-5 items-center justify-center rounded-full border border-outline-variant text-outline"
                    }
                  >
                    <Icon name={complete ? "check" : "clock"} className="h-3 w-3" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-on-surface">{label}</span>
                    <span className="shrink-0 font-mono text-[10px] text-outline">{detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-lowest/70 px-3 py-2 font-mono text-[10px] tracking-[0.12em] text-outline">
              <span>RENDER</span>
              <Icon name="arrowRight" className="h-3 w-3" />
              <span>UPLOAD</span>
              <Icon name="arrowRight" className="h-3 w-3" />
              <span className="text-tertiary">PUBLISH</span>
            </div>
          </Card>
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-2 border-t border-surface-container-highest px-5 py-6 font-mono text-[10px] uppercase tracking-[0.14em] text-outline sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>BeatFlow Studio · Private publishing desk</span>
        <span>No public sign-ups · Owner only</span>
      </footer>
    </main>
  );
}
