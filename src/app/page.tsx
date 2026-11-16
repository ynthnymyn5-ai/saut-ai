import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { getLocale } from "@/lib/i18n/server";
import { PLANS } from "@/lib/plans";
import { HOME_ALTERNATES, homeUrl, SITE_URL } from "@/lib/site";

const COPY = {
  en: {
    title: "SAUT AI — AI Employees That Answer Calls & Book Appointments 24/7",
    description: "AI employees for Gulf businesses: answer every call, reply on WhatsApp and book appointments 24/7 in Kuwaiti, Saudi, Emirati Arabic and English. 14-day free trial.",
  },
  ar: {
    title: "صوت AI — موظف ذكي يرد على المكالمات ويحجز المواعيد ٢٤/٧",
    description: "موظفون أذكياء لأعمال الخليج: يردّون على كل مكالمة ورسالة واتساب ويحجزون المواعيد على مدار الساعة باللهجة الكويتية والسعودية والإماراتية والفصحى والإنجليزية. تجربة مجانية ١٤ يوماً.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const c = COPY[locale];
  return {
    title: { absolute: c.title },
    description: c.description,
    alternates: { canonical: homeUrl(locale), languages: { ...HOME_ALTERNATES } },
    openGraph: {
      title: c.title, description: c.description, url: homeUrl(locale), siteName: "SAUT AI", type: "website",
      locale: locale === "ar" ? "ar_KW" : "en_US", alternateLocale: locale === "ar" ? ["en_US"] : ["ar_KW"],
    },
    twitter: { card: "summary_large_image", title: c.title, description: c.description },
  };
}

function structuredData(locale: "ar" | "en") {
  const prices = PLANS.map((p) => p.monthly);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${SITE_URL}/#org`, name: "SAUT AI", alternateName: "صوت", url: SITE_URL, logo: `${SITE_URL}/icons/icon-512.png` },
      { "@type": "WebSite", "@id": `${SITE_URL}/#site`, url: SITE_URL, name: "SAUT AI", inLanguage: ["ar", "en"], publisher: { "@id": `${SITE_URL}/#org` } },
      {
        "@type": "SoftwareApplication", name: "SAUT AI", applicationCategory: "BusinessApplication", operatingSystem: "Web, Android",
        description: COPY[locale].description, inLanguage: locale, publisher: { "@id": `${SITE_URL}/#org` },
        offers: { "@type": "AggregateOffer", priceCurrency: "KWD", lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: PLANS.length },
      },
    ],
  };
}

export default async function Home() {
  const locale = await getLocale();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(locale)).replace(/</g, "\\u003c") }} />
      <Landing />
    </>
  );
}
