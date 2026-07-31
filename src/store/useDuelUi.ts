"use client";

import { create } from "zustand";

type DuelUi = {
  autoPrompt: boolean;
  setAutoPrompt: (value: boolean) => void;
  rulesDebug: boolean;
  setRulesDebug: (value: boolean) => void;
  botBrain: boolean;
  setBotBrain: (value: boolean) => void;
};

const KEY = "duel-lab-auto-prompt";
const DEBUG_KEY = "duel-lab-rules-debug";
const BRAIN_KEY = "duel-lab-bot-brain";

function readStored() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(KEY) !== "off";
}

function readDebug() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEBUG_KEY) === "on";
}
function readBrain() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(BRAIN_KEY) === "on";
}

export const useDuelUi = create<DuelUi>((set) => ({
  autoPrompt: true,
  setAutoPrompt: (value) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, value ? "on" : "off");
    }
    set({ autoPrompt: value });
  },
  rulesDebug: false,
  setRulesDebug: (value) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEBUG_KEY, value ? "on" : "off");
    }
    set({ rulesDebug: value });
  },
  botBrain: false,
  setBotBrain: (value) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BRAIN_KEY, value ? "on" : "off");
    }
    set({ botBrain: value });
  },
}));

if (typeof window !== "undefined") {
  useDuelUi.setState({ autoPrompt: readStored(), rulesDebug: readDebug(), botBrain: readBrain() });
}
