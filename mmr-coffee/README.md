# MMR — Beyond Coffee

An immersive 3D website for MMR, a luxury specialty coffee brand. Every 3D object is built in code (no downloaded models, textures or HDRs), so the site ships light and works offline.

```bash
cd mmr-coffee
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
STATIC_EXPORT=1 npm run build   # fully static site in ./out (any static host)
```

## Stack
Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Three.js · React Three Fiber + drei · GSAP ScrollTrigger · Framer Motion · Lenis

## Sections
| Section | What happens | Files |
|---|---|---|
| Opening sequence | Bean mark draws itself, extraction counter, MMR letters rise, the screen parts on a liquid seam | `components/ui/Preloader.tsx` |
| Hero | Cinematic camera swoop onto a floating gold-rimmed cup with live crema, orbiting beans, slow-motion coffee ribbon with droplets, steam, gold dust; mouse parallax and scroll depth | `sections/Hero.tsx`, `three/HeroScene.tsx` |
| The Journey (scroll story) | Pinned 600vh scene driven by ScrollTrigger: green beans → roasting vortex with embers → beans pour into an espresso machine → espresso fills a glass over milk → the Signature under a spotlight with a gold halo | `sections/Journey.tsx`, `three/JourneyScene.tsx`, `three/Machine.tsx`, `three/Vessels.tsx` |
| Signature Collection | One product at a time, lit like a fragrance campaign; drag to rotate; product sheet drawer | `sections/Collection.tsx`, `three/CollectionScene.tsx` |
| The MMR Experience | Full-bleed liquid-coffee shader that bends around the pointer, macro "lenses", marquee | `sections/Experience.tsx`, `three/LiquidField.tsx` |
| Our Story | Split screen: editorial copy + a draggable gold/espresso bean sculpture | `sections/Story.tsx`, `three/Sculpture.tsx` |
| Menu | Four categories, editorial rows, hover preview that follows the cursor | `sections/Menu.tsx`, `ui/DrinkArt.tsx` |
| Footer | Gold gradient wordmark, spinning gold bean, links | `sections/Footer.tsx` |

Interaction layer: custom cursor with labels, magnetic buttons, masked line reveals, liquid wipe page transitions on navigation, film grain, Lenis smooth scroll synced to GSAP.

## Performance and accessibility
- The 3D runtime is code-split and only downloads when the first canvas is about to appear (first load ≈ 186 kB JS).
- Every canvas mounts one screen before it scrolls into view and stops rendering when it leaves.
- Device tiers (`lib/capability.ts`): **high** (desktop) gets antialiasing, 2× pixel ratio, shadows and full particle counts; **low** (phones, tablets, ≤4 cores/4 GB) gets fewer beans/particles and no ribbon; **none** (no WebGL) gets designed static fallbacks.
- `prefers-reduced-motion`: no smooth scroll, no preloader animation, no liquid wipe, slowed scenes.
- Drink illustrations are generated SVG (≈1 KB each) rather than photos.

## Edit content
- Products, menu, prices and currency: `src/lib/data.ts` (`CURRENCY` is `$`).
- Social, contact, location and privacy links: `links` in `src/lib/data.ts`. They currently point to placeholders.
- Colors and fonts: `tailwind.config.ts`, `src/app/layout.tsx`.
