"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { FlaskConical, Layers3, Play, Settings2, Swords } from "lucide-react";
import { CardViewerProvider } from "@/components/cards/CardViewer";
import { TestBanner } from "@/components/layout/TestBanner";
import { cn } from "@/lib/utils";
import { useCardStore } from "@/store/useCardStore";
import { useDeckStore } from "@/store/useDeckStore";

const NAV = [
  { href: "/", label: "Home", icon: FlaskConical },
  { href: "/decks", label: "Decks", icon: Layers3 },
  { href: "/play", label: "Play", icon: Play },
  { href: "/lab", label: "Lab", icon: Swords },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const loadCards = useCardStore((s) => s.loadLocal);
  const loadDecks = useDeckStore((s) => s.load);
  const syncing = useCardStore((s) => s.syncing);
  const count = useCardStore((s) => s.cards.length);

  useEffect(() => {
    void loadCards();
    void loadDecks();
  }, [loadCards, loadDecks]);

  const hideChrome = pathname.startsWith("/play/table");

  if (hideChrome) {
    return <CardViewerProvider>{children}</CardViewerProvider>;
  }

  return (
    <CardViewerProvider>
      <div className="min-h-full min-h-dvh">
        <TestBanner />
        <header className="sticky top-0 z-30 border-b border-line/80 bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-[92rem] items-center gap-3 px-3 py-2.5 md:gap-6 md:px-4 md:py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-sm text-zinc-950 md:h-8 md:w-8">
                DL
              </span>
              <span className="hidden sm:inline">Duel Lab</span>
            </Link>
            <nav className="hidden flex-1 items-center gap-1 md:flex">
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-bg-elev-2 hover:text-text",
                      active && "bg-bg-elev-2 text-text",
                    )}
                  >
                    <Icon size={16} />
                    {item.label === "Play" ? "Playtest" : item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto truncate text-[11px] text-muted md:text-xs">
              {syncing ? "Syncing…" : `${count.toLocaleString()} cards`}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[92rem] px-3 py-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:px-4 md:pb-4">
          {children}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
          <div className="grid grid-cols-5">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted",
                    active && "text-accent",
                  )}
                >
                  <Icon size={20} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </CardViewerProvider>
  );
}
