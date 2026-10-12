import Image from "next/image";

import type { ComponentProps } from "react";

export const YoutubeIcon = ({ height = 20, width = 20, ...props }: Omit<ComponentProps<typeof Image>, "alt" | "src">) => (
  <Image
    alt="Youtube"
    height={height}
    src="/icons/youtube.svg"
    style={{ display: "inline-block", verticalAlign: "middle" }}
    width={width}
    {...props}
  />
);
