import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Signs out: revokes the session at Supabase, then deletes every Supabase cookie on the response itself
 * (relying on the client library alone left the cookies in place, so people stayed signed in).
 */
async function signOut(req: Request) {
  const sb = await supabaseServer();
  await sb?.auth.signOut().catch(() => undefined);
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  const store = await cookies();
  for (const c of store.getAll()) {
    if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { path: "/", maxAge: 0, expires: new Date(0) });
  }
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const POST = signOut;
