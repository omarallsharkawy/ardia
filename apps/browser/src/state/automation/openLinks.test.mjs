import assert from "node:assert/strict";
import { test } from "node:test";
const stub = await import("../../test-native/index.ts");
const { useBrowser } = await import("../browser/store.ts");
const { startAutomation } = await import("./controlSocket.ts");
const { parseOpenLinks, MAX_OPEN_LINKS } = await import("./openLinks.ts");

const S = () => useBrowser.getState();
const PERSONAL = { id: "default", name: "Personal", color: "plum", icon: null, createdAt: 0 };
const tick = () => new Promise((resolve) => setImmediate(resolve));
let nextId = 0;

async function call(method, params) {
  const id = ++nextId;
  const before = stub.controlSocket.replies.length;
  stub.emitControlRequest({ connection: 7, generation: stub.controlSocket.generation, line: JSON.stringify({ id, method, params }) });
  for (let i = 0; i < 50 && !stub.controlSocket.replies.slice(before).some((r) => r.connection === 7); i++) await tick();
  return JSON.parse(stub.controlSocket.replies.slice(before).find((r) => r.connection === 7).line);
}

async function setup(littleArdia) {
  S().hydrate({ profiles: { default: PERSONAL }, profileOrder: ["default"], windows: {}, tabs: {} });
  S().updateSettings({ cliControl: true, openLinksInLittleArdia: littleArdia });
  startAutomation();
  for (let i = 0; i < 5 && !stub.controlSocket.running; i++) await tick();
  await tick();
  const main = S().createWindow({ url: "https://start.example/" });
  S().setFocusedWindow(main);
  return main;
}

const smallWindows = () => Object.values(S().windows).filter((w) => w.kind === "small");
const urlsOf = (windowId) => S().windows[windowId].tabIds.map((id) => S().tabs[id].url);

test("parseOpenLinks keeps http, https and file links and refuses the rest", () => {
  assert.deepEqual(parseOpenLinks({ urls: ["https://a.example/x", "http://b.example", "file:///tmp/a.html"] }), ["https://a.example/x", "http://b.example/", "file:///tmp/a.html"]);
  for (const params of [{}, { urls: [] }, { urls: "https://a.example/" }, { urls: [1] }, { urls: ["not a link"] }, { urls: ["javascript:alert(1)"] }, { urls: ["chrome://settings"] }, { urls: Array(MAX_OPEN_LINKS + 1).fill("https://a.example/") }]) {
    assert.ok("error" in parseOpenLinks(params), JSON.stringify(params).slice(0, 60));
  }
});

test("openLinks: a link from another app opens in Little Ardia when the setting is on", async () => {
  const main = await setup(true);
  assert.deepEqual((await call("openLinks", { urls: ["https://from-app.example/"] })).result, { ok: true });
  await tick();
  const small = smallWindows();
  assert.equal(small.length, 1);
  assert.deepEqual(urlsOf(small[0].id), ["https://from-app.example/"]);
  assert.deepEqual(urlsOf(main), ["https://start.example/"]);
});

test("openLinks: with the setting off the link opens as a tab of the main window", async () => {
  const main = await setup(false);
  assert.deepEqual((await call("openLinks", { urls: ["https://from-app.example/"] })).result, { ok: true });
  await tick();
  assert.equal(smallWindows().length, 0);
  assert.ok(urlsOf(main).includes("https://from-app.example/"));
});

test("openLinks: a bad request opens nothing", async () => {
  const main = await setup(true);
  assert.equal((await call("openLinks", { urls: ["javascript:alert(1)"] })).error.code, "bad_request");
  await tick();
  assert.equal(smallWindows().length, 0);
  assert.deepEqual(urlsOf(main), ["https://start.example/"]);
});
