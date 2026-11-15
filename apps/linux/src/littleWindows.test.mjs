import assert from "node:assert/strict";
import test from "node:test";

globalThis.__DEV__ = false;
const { useBrowser } = await import("../../browser/src/state/browser/store.ts");
const { initialHostSession, snapshotHostSession } = await import("./hostSession.ts");
const { LITTLE_SEED_TTL_MS, leaveLittleWindowSeed, takeLittleWindowSeed, withoutLittleWindows } = await import("./littleWindows.ts");

const S = () => useBrowser.getState();

function memoryStorage() {
  const items = new Map();
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    get length() { return items.size; },
    key: (index) => [...items.keys()][index] ?? null,
  };
}

const host = (windowId, startup = false) => ({ bootstrap: { windowId, profileId: "default", startup } });

function withLittleArdia(url = "https://from-app.example/") {
  S().hydrate(initialHostSession(host("main"), null, Date.now(), null));
  const small = S().createWindow({ kind: "small", url });
  return small;
}

test("the opener's seed brings the new renderer up as Little Ardia with its page", () => {
  const small = withLittleArdia();
  const storage = memoryStorage();
  const now = 1_000_000;
  assert.equal(leaveLittleWindowSeed(storage, S(), small, now), true);
  const before = snapshotHostSession(S());
  const { [small]: _, ...others } = before.windows;
  const raced = { ...before, windows: others, windowOrder: before.windowOrder.filter((id) => id !== small) };
  const session = initialHostSession(host(small), raced, now + 500, storage);
  assert.equal(session.windows[small].kind, "small");
  assert.deepEqual(session.windows[small].tabIds.map((id) => session.tabs[id].url), ["https://from-app.example/"]);
  assert.equal(session.focusedWindowId, small);
  assert.equal(storage.items.size, 0, "a seed is used once");
});

test("without a seed or a saved window, a new renderer is still a blank main window", () => {
  const small = withLittleArdia();
  const session = initialHostSession(host(small), { profiles: S().profiles, profileOrder: S().profileOrder }, Date.now(), memoryStorage());
  assert.equal(session.windows[small].kind, "main");
});

test("a stale or malformed seed is ignored", () => {
  const small = withLittleArdia();
  const storage = memoryStorage();
  leaveLittleWindowSeed(storage, S(), small, 0);
  assert.equal(takeLittleWindowSeed(storage, small, LITTLE_SEED_TTL_MS + 1), undefined);
  storage.setItem(`ardia.littleWindow:${small}`, "{not json");
  assert.equal(takeLittleWindowSeed(storage, small, 0), undefined);
  storage.setItem(`ardia.littleWindow:${small}`, JSON.stringify({ at: 0, window: { id: "other", kind: "small" }, tabs: {} }));
  assert.equal(takeLittleWindowSeed(storage, small, 0), undefined);
});

test("only a Little Ardia window leaves a seed, and leaving one clears stale ones", () => {
  withLittleArdia();
  const storage = memoryStorage();
  storage.setItem("ardia.littleWindow:old", JSON.stringify({ at: 0 }));
  storage.setItem("unrelated", "kept");
  assert.equal(leaveLittleWindowSeed(storage, S(), "main", LITTLE_SEED_TTL_MS * 10), false);
  const small = S().createWindow({ kind: "small", url: "https://b.example/" });
  assert.equal(leaveLittleWindowSeed(storage, S(), small, LITTLE_SEED_TTL_MS * 10), true);
  assert.deepEqual([...storage.items.keys()].sort(), [`ardia.littleWindow:${small}`, "unrelated"].sort());
});

test("the session shares Little Ardia with other renderers, and a launch drops it", () => {
  const small = withLittleArdia();
  const saved = snapshotHostSession(S());
  assert.equal(saved.windows[small].kind, "small");
  const tab = saved.windows[small].tabIds[0];
  assert.equal(saved.tabs[tab].url, "https://from-app.example/");

  const peer = initialHostSession(host("main"), saved, Date.now(), null);
  assert.equal(peer.windows[small].kind, "small");

  const launched = initialHostSession(host("main", true), { ...saved, focusedWindowId: small }, Date.now(), null);
  assert.equal(launched.windows[small], undefined);
  assert.equal(launched.tabs[tab], undefined);
  assert.ok(!launched.windowOrder.includes(small));
  assert.ok(launched.windows.main);
  assert.deepEqual(withoutLittleWindows({ windows: {} }), { windows: {} });
});
