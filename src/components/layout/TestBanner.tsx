"use client";

import { useEffect, useState } from "react";

/** Visible on the shared test host only — not localhost. */
export function TestBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    setShow(host !== "localhost" && host !== "127.0.0.1");
  }, []);

  if (!show) return null;

  return (
    <div className="border-b border-amber-400/40 bg-amber-300 px-3 py-1.5 text-center text-xs font-semibold text-zinc-950">
      TEST ONLY — unofficial sandbox, not a product. Tear down when done.
    </div>
  );
}
