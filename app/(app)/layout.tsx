import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { isOwner } from "@/lib/owner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  // The proxy already rejects these routes, but the layout is the final guard
  // for a rendered page. Expired Google credentials go back to the reconnect
  // screen instead of showing upload controls that cannot work.
  if (!session?.user?.email || !isOwner(session.user.email) || session.error) {
    redirect("/");
  }

  return (
    <AppShell
      user={{
        name: session.user.name ?? null,
        email: session.user.email,
        image: session.user.image ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}
