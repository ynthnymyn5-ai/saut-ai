import type { Drink } from "@/lib/data";

/** Generated drink illustration (vector, ~1 KB each): a top-down view of the vessel and its surface. */
export function DrinkArt({ look, id }: { look: Drink["look"]; id: string }) {
  if (look.vessel === "sandwich") return <SandwichArt filling={look.liquid} accent={look.top} />;
  const r = look.vessel === "espresso" ? 30 : look.vessel === "tall" ? 34 : 40;
  const art = look.art ?? "none";
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={`s-${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor={look.top} />
          <stop offset="0.75" stopColor={look.liquid} />
          <stop offset="1" stopColor="#120a05" />
        </radialGradient>
        <radialGradient id={`v-${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor={look.vessel === "glass" || look.vessel === "tall" ? "#3a332c" : "#1b1715"} />
          <stop offset="1" stopColor="#060504" />
        </radialGradient>
      </defs>
      {look.vessel !== "tall" && look.vessel !== "glass" && <ellipse cx="60" cy="64" rx="54" ry="52" fill="#0e0c0b" stroke="#d6b37a" strokeOpacity=".35" strokeWidth=".6" />}
      {look.vessel === "cup" || look.vessel === "espresso" ? <path d={`M${60 + r + 4} 52 q22 6 0 18`} fill="none" stroke="#1b1715" strokeWidth="7" strokeLinecap="round" /> : null}
      <circle cx="60" cy="60" r={r + 6} fill={`url(#v-${id})`} stroke="#d6b37a" strokeOpacity=".55" strokeWidth=".8" />
      <circle cx="60" cy="60" r={r} fill={`url(#s-${id})`} />
      {art === "heart" && <path d="M60 78c-14-9-20-17-20-24a9 9 0 0 1 20-4 9 9 0 0 1 20 4c0 7-6 15-20 24z" fill="#f3e9d8" opacity=".92" />}
      {art === "tulip" && (
        <g fill="#f3e9d8" opacity=".92">
          <ellipse cx="60" cy="48" rx="12" ry="8" />
          <path d="M44 64q16-10 32 0q-16 6-32 0z" />
          <path d="M46 76q14-8 28 0q-14 5-28 0z" />
          <rect x="59" y="44" width="2" height="36" />
        </g>
      )}
      {art === "rosetta" && (
        <g fill="none" stroke="#f3e9d8" strokeWidth="3.2" opacity=".9" strokeLinecap="round">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M${46 + i * 0.5} ${40 + i * 7}q14 ${-4 + i * 0.4} 28 0`} />
          ))}
          <path d="M60 38v44" strokeWidth="1.6" />
        </g>
      )}
      {look.ice && (
        <g fill="#ffffff" fillOpacity=".14" stroke="#ffffff" strokeOpacity=".35" strokeWidth=".6">
          <rect x="44" y="44" width="14" height="14" rx="2" transform="rotate(12 51 51)" />
          <rect x="62" y="50" width="13" height="13" rx="2" transform="rotate(-18 68 56)" />
          <rect x="50" y="64" width="12" height="12" rx="2" transform="rotate(30 56 70)" />
        </g>
      )}
      {look.garnish && <circle cx="74" cy="46" r="5" fill={look.garnish} opacity=".9" />}
      <ellipse cx="48" cy="46" rx="12" ry="5" fill="#fff" opacity=".08" transform="rotate(-30 48 46)" />
    </svg>
  );
}

/** Top-down sandwich on a plate: two toasted halves cut on the diagonal, filling showing at the cut. */
function SandwichArt({ filling, accent }: { filling: string; accent: string }) {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
      <circle cx="60" cy="60" r="56" fill="#0e0c0b" stroke="#d6b37a" strokeOpacity=".35" strokeWidth=".6" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="#efe6d8" strokeOpacity=".08" />
      <g transform="rotate(-12 60 60)">
        <path d="M24 34h60q6 0 6 6L32 92q-8 4-8-4Z" fill="#c8894a" />
        <path d="M30 40h50L36 84Z" fill="#e7b877" />
        <path d="M84 40 32 92" stroke={filling} strokeWidth="7" strokeLinecap="round" />
        <path d="M80 46 38 88" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        <path d="M96 86H36q-6 0-6-6l58-52q8-4 8 4Z" fill="#c8894a" transform="translate(6 4)" />
        <path d="M90 80H42l46-42Z" fill="#e7b877" transform="translate(6 4)" />
        <path d="M36 86 94 34" stroke={filling} strokeWidth="7" strokeLinecap="round" transform="translate(6 4)" />
      </g>
    </svg>
  );
}
