"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

interface PeptideOsSignoutHandoffProps {
  actionUrl: string;
  redirect: string;
  submitLabel: string;
}

export function PeptideOsSignoutHandoff({ actionUrl, redirect, submitLabel }: PeptideOsSignoutHandoffProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.submit();
  }, []);

  return (
    <form action={actionUrl} className="flex flex-col items-center gap-4" method="post" ref={formRef}>
      <input name="redirect" type="hidden" value={redirect} />
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
