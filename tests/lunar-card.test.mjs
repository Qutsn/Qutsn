import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  phaseAt,
  renderSvg,
  utcMidnight,
} from "../scripts/generate-lunar-card.mjs";

test("all phase names and percentage extremes produce portable SVG", () => {
  for (const fraction of [0, .125, .25, .375, .5, .625, .75, .875]) {
    const names = ["NEW MOON","WAXING CRESCENT","FIRST QUARTER","WAXING GIBBOUS","FULL MOON","WANING GIBBOUS","LAST QUARTER","WANING CRESCENT"];
    const phaseName = names[Math.round(fraction * 8)];
    const data = { fraction, illumination:(1-Math.cos(2*Math.PI*fraction))/2, phaseName };
    const svg = renderSvg("2026-11-11", data);
    assert.match(svg, /viewBox="0 0 980 360"/);
    assert.ok(svg.includes(phaseName));
    assert.ok(svg.includes('aria-label="' + Math.round(data.illumination*100) + '%"'));
    assert.doesNotMatch(svg, /NaN|Infinity|undefined|System.Windows|<script|foreignObject|<text\b|font-family|\shref=|\son[a-z]+=/i);
    assert.doesNotMatch(svg, /d="F[01]/);
    assert.equal(svg, renderSvg("2026-11-11", data, "dark"));
    assert.equal(svg, renderSvg("2026-11-11", data));
  }
});

test("date labels update including leap days and year boundaries", () => {
  for (const date of ["2028-02-29", "2026-12-31", "2027-01-01"]) {
    const svg = renderSvg(date);
    const [year, month, day] = date.split("-");
    assert.ok(svg.includes('aria-label="' + day + ' / ' + month + ' ' + year + ' · UTC"'));
    assert.ok(svg.includes(date + " at 00:00 UTC"));
  }
  assert.throws(() => renderSvg("2026-11-11", undefined, "missing"), /Unknown theme/);
});

test("exported glyph outlines cover daily data", () => {
  const atlas = JSON.parse(readFileSync(new URL("../scripts/lunar-lettering.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""));
  for (const alphabet of Object.values(atlas)) {
    for (const glyph of Object.values(alphabet)) {
      assert.ok(Number.isFinite(glyph.advance) && glyph.advance > 0);
      assert.ok(glyph.bounds.every(Number.isFinite));
      if (glyph.d) assert.match(glyph.d, /^M/);
    }
  }
});

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

