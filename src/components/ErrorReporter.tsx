"use client";
import { useEffect } from "react";
import { sendClientError } from "@/lib/client-errors";

export function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => sendClientError(ev.error ?? ev.message, "error");
    const onRejection = (ev: PromiseRejectionEvent) => sendClientError(ev.reason, "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
