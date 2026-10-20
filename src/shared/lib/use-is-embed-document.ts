"use client";

import { useEffect, useState } from "react";

export function useIsEmbedDocument() {
  const [isEmbed, setIsEmbed] = useState(false);

  useEffect(() => {
    setIsEmbed(document.documentElement.getAttribute("data-wc-embed") === "1");
  }, []);

  return isEmbed;
}
