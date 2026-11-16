import { assetLinks } from "@/lib/native-core";

/**
 * Digital Asset Links for the Android app: lets Android open our links (email confirmation, password reset,
 * dashboard) straight in the SAUT AI app. Set ANDROID_CERT_SHA256 to the release key's SHA-256 fingerprint
 * (printed in build-android.log by the android workflow; comma-separate several, e.g. Play App Signing + upload key).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(assetLinks(process.env.ANDROID_APP_ID || "com.sautai.app", process.env.ANDROID_CERT_SHA256 ?? ""), {
    headers: { "cache-control": "public, max-age=3600" },
  });
}
