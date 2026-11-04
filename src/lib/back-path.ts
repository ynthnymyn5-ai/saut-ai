/** Where the in-app back arrow goes: one level up the URL; top-level screens go to the overview; the overview has none. */
export function backTarget(path: string): string | null {
  const clean = path.replace(/\/+$/, "") || "/";
  if (!clean.startsWith("/dashboard") || clean === "/dashboard") return null;
  const parts = clean.split("/").filter(Boolean); // ["dashboard", "orders", ...]
  if (parts.length <= 2) return "/dashboard";
  return "/" + parts.slice(0, -1).join("/");
}
