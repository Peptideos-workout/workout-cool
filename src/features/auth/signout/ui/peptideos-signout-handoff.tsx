"use client";

import { useEffect, useRef } from "react";

import { embedFrameTarget } from "@/features/embed/lib/embed-mode";
import { Button } from "@/components/ui/button";

interface PeptideOsSignoutHandoffProps {
  actionUrl: string;
  autoSubmit?: boolean;
  fallbackLabel: string;
  redirect: string;
  submitLabel: string;
}

export function PeptideOsSignoutHandoff({
  actionUrl,
  autoSubmit = false,
  fallbackLabel,
  redirect,
  submitLabel
}: PeptideOsSignoutHandoffProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    if (document.documentElement.getAttribute("data-wc-embed") === "1") {
      const target = embedFrameTarget(true, actionUrl, window.location.origin);
      if (target) {
        form.target = target;
      }
    }
    if (autoSubmit) {
      form.submit();
    }
  }, [actionUrl, autoSubmit]);

  return (
    <form action={actionUrl} className="flex flex-col items-center gap-4" method="post" ref={formRef}>
      <input name="redirect" type="hidden" value={redirect} />
      {autoSubmit ? (
        <Button className="signout-continue-fallback min-h-12 px-8 py-3 text-lg" style={{ display: "none" }} type="submit">
          {fallbackLabel}
        </Button>
      ) : (
        <Button type="submit">{submitLabel}</Button>
      )}
    </form>
  );
}
