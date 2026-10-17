"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/generate" });
}

export async function signOutOfGoogle() {
  await signOut({ redirectTo: "/" });
}
