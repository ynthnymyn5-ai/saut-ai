import type { SVGProps } from "react";

/**
 * Mmar wordmark, redrawn as vector from the shop sign: a cup-shaped "M" with its
 * accent stroke, a smaller echoing "M", then "ar". Paths share one fill, so the
 * whole mark can take a colour or a gradient.
 */
export function MmarLogo({ title = "Mmar", fill = "currentColor", ...rest }: SVGProps<SVGSVGElement> & { title?: string; fill?: string }) {
  return (
    <svg viewBox="0 0 360 102" role="img" aria-label={title} {...rest}>
      {rest.children}
      <g fill={fill}>
        {/* M */}
        <path className="logo-glyph" d="M0 24Q0 18 6 18H24Q30 18 30 24C50 88 100 88 120 22Q121 16 126 16H144Q150 16 150 22V94Q150 100 144 100H6Q0 100 0 94Z" />
        <path className="logo-accent" d="M36 14 80 5Q83 4.6 83.4 7.6L84 11Q84.4 14 81.4 14.6L38 23Q35 23.6 34.6 20.6L34 17.6Q33.6 14.6 36 14Z" />
        {/* small M */}
        <path className="logo-glyph" d="M162 48Q162 42 168 42H173Q178 42 179 46C190 82 210 82 220 46Q221 42 226 42H231Q237 42 237 48V95Q237 100 232 100H167Q162 100 162 95Z" />
        <path className="logo-accent" d="M183 33 205 28Q208 27.4 208.5 30.4L209 32.6Q209.4 35.4 206.6 36L184.6 40.8Q181.8 41.4 181.3 38.6L180.9 36.4Q180.5 33.6 183 33Z" />
        {/* a */}
        <g className="logo-glyph">
          <path fillRule="evenodd" d="M247 71a29 29 0 1 0 58 0a29 29 0 1 0-58 0ZM263 71a13 13 0 1 0 26 0a13 13 0 1 0-26 0Z" />
          <rect x="291" y="42" width="15" height="58" rx="3" />
        </g>
        {/* r */}
        <g className="logo-glyph">
          <rect x="316" y="42" width="15" height="58" rx="3" />
          <path d="M316 64Q316 42 340 42H353Q357 42 357 46V53Q357 57 353 57H341Q331 57 331 67Z" />
        </g>
      </g>
    </svg>
  );
}

/** Arabic brand name set under the Latin wordmark. */
export function ArabicName({ className = "" }: { className?: string }) {
  return (
    <span lang="ar" dir="rtl" className={`font-arabic font-bold leading-none ${className}`}>
      مرمر
    </span>
  );
}

/** Navigation lock-up: wordmark with مرمر centred beneath it. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <MmarLogo className="h-[22px] w-auto text-cream" />
      <ArabicName className="text-[13px] text-gold" />
    </span>
  );
}
