import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const LOCALE_COOKIE = "saut_locale";
const PROTECTED = ["/dashboard", "/admin", "/print"];

/**
 * 1. Picks the default language: Arabic for Arabic-speaking visitors, English otherwise.
 * 2. Refreshes the Supabase session cookie.
 * 3. Redirects signed-out visitors away from /dashboard and /admin.
 *    (Admin *role* checks happen server-side in the admin layout and every admin API route.)
 */
export async function middleware(req: NextRequest) {
  // /ar and /en are the homepage in one language (own URLs for search engines and shared links); ?lang=
  // does the same on any page. Either wins over the cookie and applies to this request too.
  const path0 = req.nextUrl.pathname;
  const lang = path0 === "/ar" || path0 === "/en" ? path0.slice(1) : req.nextUrl.searchParams.get("lang");
  const forced = lang === "ar" || lang === "en" ? lang : null;
  if (forced) req.cookies.set(LOCALE_COOKIE, forced);
  const res = path0 === "/ar" || path0 === "/en"
    ? NextResponse.rewrite(new URL(`/${req.nextUrl.search}`, req.url), { request: { headers: req.headers } })
    : NextResponse.next({ request: { headers: req.headers } });

  if (forced) {
    res.cookies.set(LOCALE_COOKIE, forced, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } else if (!req.cookies.get(LOCALE_COOKIE)) {
    const accept = req.headers.get("accept-language") ?? "";
    const locale = /^ar\b|,\s*ar\b/i.test(accept) || accept.toLowerCase().startsWith("ar") ? "ar" : "en";
    res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }

  if (req.nextUrl.pathname === "/auth/signout") return res; // never re-issue session cookies while signing out
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return res; // demo mode — no auth backend configured

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => list.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path.startsWith(p))) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  return res;
}

export const config = {
  // Static assets, PWA files and server-to-server endpoints skip the session refresh.
  matcher: ["/((?!_next/static|_next/image|favicon.svg|icon.svg|icons/|brand/|sw.js|robots.txt|sitemap.xml|opengraph-image|manifest.webmanifest|offline.html|api/webhooks|api/telephony|api/internal|api/cron|api/widget|api/client-error|widget/|widget.js).*)"],
};
