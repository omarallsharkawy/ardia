import assert from "node:assert/strict";
import test from "node:test";
import { paintersUnder } from "./pageHoles.ts";

function tree(spec, parent = null) {
  const node = { name: spec.name, rect: spec.rect, paints: !!spec.paints, layer: !!spec.layer, raised: !!spec.raised, parentElement: parent, children: [] };
  node.children = (spec.children ?? []).map((child) => tree(child, node));
  return node;
}

function find(node, name) {
  if (node.name === name) return node;
  for (const child of node.children) {
    const found = find(child, name);
    if (found) return found;
  }
  return null;
}

const deps = { rectOf: (node) => node.rect, paints: (node) => node.paints, skip: (node) => node.layer || node.raised };
const full = { x: 0, y: 0, width: 1400, height: 900 };
const peekPage = { x: 100, y: 100, width: 1200, height: 750 };

test("a Peek's panel and scrim, drawn before its page, are holed; what is drawn after it is not", () => {
  const root = tree({
    name: "body",
    rect: full,
    children: [
      { name: "sidebar", rect: { x: 0, y: 0, width: 90, height: 900 }, paints: true },
      {
        name: "overlay",
        rect: full,
        children: [
          { name: "scrimWrap", rect: full, children: [{ name: "scrim", rect: full, paints: true }] },
          {
            name: "card",
            rect: { x: 80, y: 50, width: 1240, height: 820 },
            children: [
              { name: "panel", rect: { x: 80, y: 50, width: 1240, height: 820 }, paints: true },
              {
                name: "body",
                rect: { x: 80, y: 50, width: 1240, height: 820 },
                children: [
                  { name: "backdrop", rect: { x: 80, y: 50, width: 1240, height: 820 }, paints: true, layer: true },
                  { name: "bar", rect: { x: 80, y: 50, width: 1240, height: 50 }, paints: true },
                  { name: "pageCard", rect: peekPage, paints: true, children: [{ name: "slot", rect: peekPage }, { name: "prompt", rect: { x: 500, y: 300, width: 200, height: 100 }, paints: true }] },
                ],
              },
              { name: "rim", rect: { x: 80, y: 50, width: 1240, height: 820 }, paints: true },
            ],
          },
          { name: "toast", rect: { x: 600, y: 800, width: 200, height: 40 }, paints: true },
        ],
      },
    ],
  });
  const under = paintersUnder(find(root, "slot"), root, peekPage, deps).map((node) => node.name);
  assert.deepEqual(under.sort(), ["panel", "scrim"]);
});

test("a raised sibling stays above the page, and the walk stops at the root", () => {
  const root = tree({
    name: "root",
    rect: full,
    children: [
      { name: "floating", rect: full, paints: true, raised: true },
      { name: "pane", rect: full, children: [{ name: "slot", rect: peekPage }] },
    ],
  });
  const outside = tree({ name: "outside", rect: full, children: [{ name: "behind", rect: full, paints: true }, root] });
  root.parentElement = outside;
  assert.deepEqual(paintersUnder(find(root, "slot"), root, peekPage, deps), []);
});
