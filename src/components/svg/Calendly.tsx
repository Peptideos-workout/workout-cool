import Image from "next/image";

import type { ComponentProps } from "react";

// On utilise l'image SVG du dossier public
export const CalendlyIcon = (props: Omit<ComponentProps<typeof Image>, "alt" | "src">) => (
  <Image
    alt="Calendly"
    height={20}
    src="/icons/calendly.svg"
    style={{ display: "inline-block", verticalAlign: "middle" }}
    width={20}
    {...props}
  />
);
