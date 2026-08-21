import assert from "node:assert/strict";
import test from "node:test";

import {
  phaseAt,
  renderSvg,
  utcMidnight,
} from "../scripts/generate-lunar-card.mjs";

test("phase model stays within physical bounds", () => {
  for (const value of [
    "2024-04-08T18:21:00.000Z",
    "2024-04-15T19:13:00.000Z",
    "2024-04-23T23:49:00.000Z",
    "2024-05-01T11:27:00.000Z",
  ]) {
    const phase = phaseAt(new Date(value));
    assert.ok(phase.fraction >= 0 && phase.fraction < 1);
    assert.ok(phase.illumination >= 0 && phase.illumination <= 1);
    assert.ok(phase.age >= 0 && phase.age < 29.531);
  }
});

test("known 2024 lunar events land near their expected phases", () => {
  const newMoon = phaseAt(new Date("2024-04-08T18:21:00.000Z"));
  const firstQuarter = phaseAt(new Date("2024-04-15T19:13:00.000Z"));
  const fullMoon = phaseAt(new Date("2024-04-23T23:49:00.000Z"));
  const lastQuarter = phaseAt(new Date("2024-05-01T11:27:00.000Z"));

  assert.ok(newMoon.illumination < 0.02);
  assert.ok(firstQuarter.illumination > 0.4 && firstQuarter.illumination < 0.6);
  assert.ok(fullMoon.illumination > 0.98);
  assert.ok(lastQuarter.illumination > 0.4 && lastQuarter.illumination < 0.6);
});

test("UTC date parsing rejects impossible dates", () => {
  assert.equal(utcMidnight("2026-08-21").toISOString(), "2026-08-21T00:00:00.000Z");
  assert.throws(() => utcMidnight("2026-02-30"), /Invalid calendar date/);
  assert.throws(() => utcMidnight("21-08-2026"), /YYYY-MM-DD/);
});

test("SVG output is deterministic, restrained, transparent, self-contained, and finite", () => {
  const first = renderSvg("2026-08-21");
  const second = renderSvg("2026-08-21");

  assert.equal(first, second);
  assert.match(first, /^<svg/);
  assert.match(first, /<title id="title">/);
  assert.match(first, /2026-08-21/);
  assert.match(first, /FIRST QUARTER/);
  assert.doesNotMatch(first, /00:00 GMT/);
  assert.match(first, /aria-label="2026-08-21 \/ UTC"/);
  assert.match(first, /shape-rendering="crispEdges"/);
  assert.doesNotMatch(first, /[㐀-鿿]/);
  assert.doesNotMatch(first, /<rect\b[^>]*(?:width="980"|height="220")/i);
  assert.doesNotMatch(first, /<ellipse\b/i);
  assert.doesNotMatch(first, /#(?:B3261E|FF6B58)/i);
  assert.doesNotMatch(first, /M22 18H/);
  assert.ok((first.match(/<text\b/g) ?? []).length <= 5);
  assert.doesNotMatch(first, /<script|foreignObject|\shref=|\son[a-z]+=/i);
  assert.doesNotMatch(first, /(?:href|xlink:href)=['"]https?:\/\//i);
  assert.doesNotMatch(first, /NaN|Infinity|undefined/);
});

test("light and dark themes are both renderable and structurally aligned", () => {
  const light = renderSvg("2026-08-21", undefined, "light");
  const dark = renderSvg("2026-08-21", undefined, "dark");

  assert.doesNotMatch(light, /00:00 GMT/);
  assert.doesNotMatch(dark, /00:00 GMT/);
  assert.doesNotMatch(light, /[㐀-鿿]/);
  assert.doesNotMatch(dark, /[㐀-鿿]/);
  assert.notEqual(light, dark);
  assert.equal((light.match(/<path/g) ?? []).length, (dark.match(/<path/g) ?? []).length);
  assert.doesNotMatch(light, /<rect\b[^>]*(?:width="980"|height="220")/i);
  assert.doesNotMatch(dark, /<rect\b[^>]*(?:width="980"|height="220")/i);
  assert.doesNotMatch(light, /<ellipse\b/i);
  assert.doesNotMatch(dark, /<ellipse\b/i);
  assert.doesNotMatch(light, /#(?:B3261E|FF6B58)/i);
  assert.doesNotMatch(dark, /#(?:B3261E|FF6B58)/i);
  assert.match(light, /shape-rendering="crispEdges"/);
  assert.match(dark, /shape-rendering="crispEdges"/);
  assert.ok((light.match(/<text\b/g) ?? []).length <= 5);
  assert.ok((dark.match(/<text\b/g) ?? []).length <= 5);
});
