import Link from "next/link";

import { auth, signIn, signOut } from "@/auth";
import { isOwner } from "@/lib/owner";

async function signInWithGoogle() {
  "use server";
  await signIn("google", { redirectTo: "/generate" });
}

async function signOutOfGoogle() {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user);
  const owner = isOwner(session?.user?.email);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">BeatFlow</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Personal YouTube publishing tool. Renders the video in the browser and uploads it
          straight to the owner&apos;s channel.
        </p>
      </div>

      {!signedIn ? (
        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="h-11 rounded-full bg-foreground px-6 font-medium text-background transition-opacity hover:opacity-90"
          >
            Sign in with Google
          </button>
        </form>
      ) : owner ? (
        <div className="flex flex-col gap-4 rounded-xl border border-black/[.08] p-6 dark:border-white/[.145]">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-zinc-500">Signed in as</span>
            <span className="font-medium">{session?.user?.email}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/generate"
              className="flex h-11 items-center rounded-full bg-foreground px-6 font-medium text-background transition-opacity hover:opacity-90"
            >
              Open M0 test page
            </Link>
            <form action={signOutOfGoogle}>
              <button
                type="submit"
                className="h-11 rounded-full border border-black/[.08] px-6 font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <p className="font-medium text-red-600 dark:text-red-400">
            This account is not the owner.
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {session?.user?.email}. Every route rejects accounts other than{" "}
            <code className="font-mono">OWNER_EMAIL</code>.
          </p>
          <form action={signOutOfGoogle}>
            <button
              type="submit"
              className="h-11 rounded-full border border-black/[.08] px-6 font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
