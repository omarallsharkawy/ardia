import type { BrowserState, HydrateData } from "../../browser/src/state/browser/store";
import type { BrowserWindow, Tab } from "../../browser/src/state/browser/types";

// Little Ardia on Linux. Every window runs its own renderer, which builds its state from the shared session when it
// starts. A Little Ardia window travels in that session like a main window, so every renderer agrees on it and a close
// reaches them all, but it never outlives a launch (as on macOS, it isn't restored). The window that opens one also
// leaves a one-time seed in the shell's shared localStorage, because the new renderer can start before the session
// write that carries the window has landed; without either it would come up as a blank main window.

export type LittleWindowSeed = { window: BrowserWindow; tabs: Record<string, Tab>; at: number };
export type SeedStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
};

const PREFIX = "ardia.littleWindow:";
export const LITTLE_SEED_TTL_MS = 60_000;
const SEED_LIMIT = 256 * 1024;

export function seedStorage(): SeedStorage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function littleWindowSeed(state: Pick<BrowserState, "windows" | "tabs">, id: string, now = Date.now()): LittleWindowSeed | undefined {
  const w = state.windows[id];
  if (w?.kind !== "small") return undefined;
  const tabs: Record<string, Tab> = {};
  for (const tabId of w.tabIds) {
    const tab = state.tabs[tabId];
    if (tab && tab.windowId === id) tabs[tabId] = tab;
  }
  const tabIds = w.tabIds.filter((tabId) => tabs[tabId]);
  if (!tabIds.length) return undefined;
  const activeTabIds = Object.fromEntries(Object.entries(w.activeTabIds).filter(([, tabId]) => tabs[tabId]));
  return { window: { ...w, tabIds, activeTabIds }, tabs, at: now };
}

function dropStale(storage: SeedStorage, now: number) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    try {
      const at = (JSON.parse(storage.getItem(key) ?? "null") as { at?: unknown } | null)?.at;
      if (typeof at !== "number" || Math.abs(now - at) > LITTLE_SEED_TTL_MS) storage.removeItem(key);
    } catch {
      storage.removeItem(key);
    }
  }
}

export function leaveLittleWindowSeed(storage: SeedStorage | null, state: Pick<BrowserState, "windows" | "tabs">, id: string, now = Date.now()) {
  if (!storage) return false;
  const seed = littleWindowSeed(state, id, now);
  if (!seed) return false;
  const text = JSON.stringify(seed);
  if (text.length > SEED_LIMIT) return false;
  try {
    dropStale(storage, now);
    storage.setItem(PREFIX + id, text);
    return true;
  } catch {
    return false;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function validSeed(value: unknown, id: string, now: number): value is LittleWindowSeed {
  if (!isRecord(value) || typeof value.at !== "number" || Math.abs(now - value.at) > LITTLE_SEED_TTL_MS) return false;
  const w = value.window;
  if (!isRecord(w) || w.id !== id || w.kind !== "small" || typeof w.profileId !== "string" || !Array.isArray(w.tabIds) || !w.tabIds.length || !isRecord(w.activeTabIds)) return false;
  if (!isRecord(value.tabs)) return false;
  const tabs = value.tabs;
  return w.tabIds.every((tabId) => {
    const tab = typeof tabId === "string" ? tabs[tabId] : undefined;
    return isRecord(tab) && tab.id === tabId && tab.windowId === id && typeof tab.url === "string" && typeof tab.profileId === "string";
  });
}

export function takeLittleWindowSeed(storage: SeedStorage | null, id: string, now = Date.now()): LittleWindowSeed | undefined {
  if (!storage) return undefined;
  try {
    const text = storage.getItem(PREFIX + id);
    if (text === null) return undefined;
    storage.removeItem(PREFIX + id);
    const seed: unknown = JSON.parse(text);
    return validSeed(seed, id, now) ? seed : undefined;
  } catch {
    return undefined;
  }
}

export function withLittleWindow(session: HydrateData, seed: LittleWindowSeed): HydrateData {
  const { id } = seed.window;
  return {
    ...session,
    windows: { ...session.windows, [id]: seed.window },
    windowOrder: [...new Set([...(session.windowOrder ?? []), id])],
    tabs: { ...session.tabs, ...seed.tabs },
    focusedWindowId: id,
  };
}

export function withoutLittleWindows(session: HydrateData): HydrateData {
  const gone = new Set(Object.entries(session.windows ?? {}).filter(([, w]) => w?.kind === "small").map(([id]) => id));
  if (!gone.size) return session;
  return {
    ...session,
    windows: Object.fromEntries(Object.entries(session.windows ?? {}).filter(([id]) => !gone.has(id))),
    windowOrder: (session.windowOrder ?? []).filter((id) => !gone.has(id)),
    tabs: Object.fromEntries(Object.entries(session.tabs ?? {}).filter(([, tab]) => !gone.has(tab.windowId))),
    focusedWindowId: session.focusedWindowId && gone.has(session.focusedWindowId) ? null : session.focusedWindowId,
  };
}

// A Little Ardia window's title starts with this on Linux, so a tiling compositor's window rules can tell it from a
// main window (both have app id `ardia`) and open it floating, as it is on macOS. niri, for example:
//   window-rule { match app-id="^ardia$" title="^Little Ardia"; open-floating true; }
// The opener passes the title, so the window has it before it is first shown.
export const LITTLE_TITLE = "Little Ardia";

export function littleWindowTitle(title: string): string {
  const cut = title.indexOf(" — ");
  const label = (cut >= 0 ? title.slice(cut + 3) : title).trim();
  return label ? `${LITTLE_TITLE} — ${label}` : LITTLE_TITLE;
}
