"use client";

import { Suspense } from "react";
import { Playmat } from "@/components/play/Playmat";

export default function TablePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-white/60">Loading table…</p>}>
      <Playmat />
    </Suspense>
  );
}
