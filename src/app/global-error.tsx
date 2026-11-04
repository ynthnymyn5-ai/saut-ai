"use client";
import { useEffect } from "react";
import { sendClientError } from "@/lib/client-errors";

/** Last-resort boundary when the root layout itself fails. Keeps its own <html>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { sendClientError(error, "boundary", error.digest); }, [error]);
  return (
    <html lang="ar" dir="rtl">
      <body style={{ background: "#0B0A1F", color: "#F4F2FF", fontFamily: "Tahoma, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 22 }}>حدث خطأ · Something went wrong</h1>
          {error.digest && <p style={{ fontSize: 12, opacity: 0.6 }}>ref: {error.digest}</p>}
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 12, border: 0, background: "#7C5CFF", color: "#fff" }}>إعادة المحاولة · Try again</button>
        </div>
      </body>
    </html>
  );
}
