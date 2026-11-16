import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** The homepage once per language (each listing both), then the other public pages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = { ar: `${SITE_URL}/ar`, en: `${SITE_URL}/en` };
  return [
    { url: languages.ar, changeFrequency: "weekly", priority: 1, alternates: { languages } },
    { url: languages.en, changeFrequency: "weekly", priority: 1, alternates: { languages } },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
