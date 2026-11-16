import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./auth";

/** For server components/layouts: the signed-in user or a redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser(await headers());
  if (!user) redirect("/login");
  return user;
}

export async function optionalUser(): Promise<SessionUser | null> {
  return getSessionUser(await headers());
}
