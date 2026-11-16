# MMR — Beyond Coffee

An immersive 3D website for MMR, a luxury specialty coffee brand. Every 3D object is built in code (no downloaded models, textures or HDRs). Real photography and film plug in through `media-src/` (see below).

```bash
cd mmr-coffee
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
STATIC_EXPORT=1 npm run build   # fully static site in ./out (any static host)
```

## Stack
Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Three.js · React Three Fiber + drei · GSAP ScrollTrigger · Framer Motion

## Sections
| Section | What happens | Files |
|---|---|---|
| Opening sequence (≈1.4 s, once per visit) | The Mmar wordmark and مرمر rise in, then the screen parts | `components/ui/Preloader.tsx` |
| Hero | The shop's espresso-tray photograph with a cinematic push-in and scroll parallax (no WebGL, loads instantly) | `sections/Hero.tsx` |
| The Journey (scroll story) | Pinned 600vh scene driven by ScrollTrigger: green beans → roasting vortex with embers → beans pour into an espresso machine → espresso fills a glass over milk → the Signature under a spotlight with a gold halo | `sections/Journey.tsx`, `three/JourneyScene.tsx`, `three/Machine.tsx`, `three/Vessels.tsx` |
| Signature Collection | One product at a time, lit like a fragrance campaign; drag to rotate; product sheet drawer | `sections/Collection.tsx`, `three/CollectionScene.tsx` |
| The MMR Experience | Full-bleed liquid-coffee shader that bends around the pointer, macro "lenses", marquee | `sections/Experience.tsx`, `three/LiquidField.tsx` |
| Our Story | Split screen: editorial copy + the Mmar paper-cup photograph (3D bean sculpture if no photo) | `sections/Story.tsx` |
| Menu | Four categories, editorial rows, hover preview that follows the cursor | `sections/Menu.tsx`, `ui/DrinkArt.tsx` |
| Footer | Gold gradient wordmark, مرمر sign mark, tagline, links | `sections/Footer.tsx` |

Interaction layer: custom cursor with labels, magnetic buttons, masked line reveals, native browser scrolling with smooth anchor navigation.

## Performance and accessibility
- The 3D runtime is code-split and only downloads when the first canvas is about to appear (first load ≈ 186 kB JS).
- Every canvas mounts one screen before it scrolls into view, renders only while on screen, caps its pixel ratio at the screen's (1.5× max on desktop, 1× on phones) and lowers it further if the frame rate drops.
- The hero and story are photographs, so the first screen needs no 3D at all.
- Device tiers (`lib/capability.ts`): **high** (desktop) gets antialiasing and full particle counts; **low** (phones, tablets, ≤4 cores/4 GB) gets fewer beans/particles and no ribbon; **none** (no WebGL) gets designed static fallbacks.
- `prefers-reduced-motion`: no preloader animation, no parallax, instant jumps, slowed scenes.
- Drink illustrations are generated SVG (≈1 KB each) rather than photos.

## English and Arabic
- A language switch (عربي / EN) sits in the header. The choice is remembered; first-time visitors whose browser is in Arabic start in Arabic.
- Arabic switches the page to right-to-left: navigation, the scroll story (text and 3D framing mirror), product panel, menu and footer.
- Arabic uses Reem Kufi for headings and IBM Plex Sans Arabic for reading text, Arabic-Indic numerals, and prices in د.ك. Letter-spacing and italics are switched off for Arabic so letters stay joined.
- All copy lives in `src/lib/strings.ts` (`en` and `ar`); Arabic product text is `productsAr` in the same file; menu items carry both languages in `src/lib/data.ts`.

## Real photos and video
1. Put the brand's files in `media-src/` using the names in [`media-src/README.md`](media-src/README.md) (story photo, experience film, product photos, one photo per menu drink).
2. Run `npm run media` (needs ffmpeg). Images become WebP (menu 900 px, products 1400 px, story 2000 px); the film becomes MP4 + WebM (1600 px, max 20 s, no audio) with a poster frame.
3. Run `npm run build`. Each slot shows the real media automatically; empty slots keep the 3D scene or illustration.

| Slot | Replaces |
|---|---|
| `story` | the bean sculpture in Our Story |
| `experience` | the liquid shader behind "More than a coffee" |
| `products/<id>` | adds a photograph to each product sheet (the 3D showcase stays) |
| `menu/<drink>` | the generated drink illustration in the menu and hover preview |

## Edit content
- Products, menu and prices: `src/lib/data.ts`. Prices are Kuwaiti dinar, shown with three decimals (`formatPrice`).
- Social, contact, location and privacy links: `links` in `src/lib/data.ts`. They currently point to placeholders.
- Colors and fonts: `tailwind.config.ts`, `src/app/layout.tsx`.
