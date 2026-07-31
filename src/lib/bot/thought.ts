export type BotThought = {
  at: string;
  note: string;
  why: string;
  plan: string;
  board: string;
  skipped?: string;
};

const ring: BotThought[] = [];
const listeners = new Set<() => void>();

export function pushBotThought(t: Omit<BotThought, "at">) {
  ring.unshift({ ...t, at: new Date().toISOString() });
  if (ring.length > 24) ring.length = 24;
  listeners.forEach((fn) => fn());
}

export function getBotThoughts(): BotThought[] {
  return ring.slice();
}

export function subscribeBotThoughts(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
