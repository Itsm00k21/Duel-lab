"use client";

import { useEffect, useState } from "react";

/** Touch / phone / tablet — tap should open actions, not assume hover/right-click. */
export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const pointer = window.matchMedia("(pointer: coarse)");
    const hover = window.matchMedia("(hover: none)");
    const update = () => setCoarse(pointer.matches || hover.matches || window.innerWidth < 768);
    update();
    pointer.addEventListener("change", update);
    hover.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      pointer.removeEventListener("change", update);
      hover.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return coarse;
}
