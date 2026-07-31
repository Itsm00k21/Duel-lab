"use client";

import { KIND_TABS, type CardKind } from "@/lib/cards/kinds";
import { cn } from "@/lib/utils";

export function TypeTabs({
  value,
  onChange,
  counts,
  compact,
  allLabel = "All",
  allShort = "All",
}: {
  value: CardKind | "all";
  onChange: (value: CardKind | "all") => void;
  counts?: Partial<Record<CardKind | "all", number>>;
  compact?: boolean;
  allLabel?: string;
  allShort?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {KIND_TABS.map((tab) => {
        const count = counts?.[tab.id];
        const label = tab.id === "all" ? (compact ? allShort : allLabel) : compact ? tab.short : tab.label;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
              value === tab.id
                ? "border-accent bg-accent text-zinc-950"
                : "border-line bg-bg text-muted hover:border-accent/50 hover:text-text",
              compact && "px-2 py-0.5",
            )}
          >
            {label}
            {typeof count === "number" ? ` ${count}` : ""}
          </button>
        );
      })}
    </div>
  );
}
