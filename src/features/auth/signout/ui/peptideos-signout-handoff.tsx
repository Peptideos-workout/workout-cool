"use client";

import { useEffect, useRef } from "react";

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
    if (autoSubmit) {
      formRef.current?.submit();
    }
  }, [autoSubmit]);

  return (
    <form action={actionUrl} className="flex flex-col items-center gap-4" method="post" ref={formRef}>
      <input name="redirect" type="hidden" value={redirect} />
      {autoSubmit ? (
        <Button className="signout-continue-fallback" style={{ display: "none" }} type="submit">
          {fallbackLabel}
        </Button>
      ) : (
        <Button type="submit">{submitLabel}</Button>
      )}
    </form>
  );
}
