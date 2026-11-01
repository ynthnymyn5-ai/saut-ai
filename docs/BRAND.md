# SAUT AI — Brand

**Name:** SAUT AI (صوت = "voice") · **Mascot:** SO (سو) · **Tagline:** Your Business. Our Intelligence. / عملك. ذكاؤنا.

## Mark
An **S** whose spine turns into a soundwave — the moment a business's voice becomes intelligent. Drawn as one continuous stroke (5 px on a 64 px grid, round caps) with a purple→blue gradient inside a soft rounded-square tile.
Files: `public/brand/logo-dark.svg`, `logo-light.svg`, `app-icon.svg`, `favicon.svg`; React: `<Logo />`, `<LogoMark />`.
Keep clear space of ½ tile around the mark. Never recolour the S solid, stretch it, or place it on busy imagery.

## Wordmark
`SAUT` in Sora SemiBold, tracking +0.18em, with `AI` in the brand gradient. Wordmark is always LTR, also on Arabic pages.

## SO — the mascot
A floating glass orb: white specular highlight, violet → electric-blue body, a dark visor with glowing capsule eyes. SO reacts to the conversation:

| State | Expression |
|---|---|
| idle | soft smile, slow blink |
| listening | open "o" mouth, light-wave rings pulse outward |
| thinking | eyes glance up, small dot mouth |
| speaking | mouth becomes an animated soundwave, rings pulse |
| completed | happy arched eyes |
| transfer | flat line mouth |

Each AI employee gets its own hue (`hue` prop) so teams of employees stay recognisable. Respects `prefers-reduced-motion`.

## Colour
| Token | Hex | Use |
|---|---|---|
| Ink | `#080812` | background |
| Ink 2 | `#111121` | surfaces |
| Violet | `#8B5CF6` | primary, CTAs, glow |
| Electric | `#38BDF8` | accents, data |
| White | `#FFFFFF` | text |
| Muted | `#A1A1B5` | secondary text |

## Type
Latin: **Sora** (display) + **Manrope** (UI). Arabic: **IBM Plex Sans Arabic** for both, with no letter-spacing.

## Surfaces
Glass panels (4% white, 8% hairline border, 20px blur), gradient glow borders on featured elements, purple glow on primary buttons. Motion is short (200–600 ms), eased, and never blocks input.
