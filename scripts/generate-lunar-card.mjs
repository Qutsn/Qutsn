import { MoonPhase, Illumination, SearchMoonPhase } from "astronomy-engine";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";


const PHASES = [
  "NEW MOON",
  "WAXING CRESCENT",
  "FIRST QUARTER",
  "WAXING GIBBOUS",
  "FULL MOON",
  "WANING GIBBOUS",
  "LAST QUARTER",
  "WANING CRESCENT",
];

const THEMES = { light: true, dark: true };



// Principal phase labels use a narrow 1-degree window, not a multi-day bin.
function phaseIndexAt(fraction) {
  const angle = fraction * 360;
  if (angle <= 1 || angle >= 359) return 0;
  if (Math.abs(angle - 90) <= 1) return 2;
  if (Math.abs(angle - 180) <= 1) return 4;
  if (Math.abs(angle - 270) <= 1) return 6;
  return angle < 90 ? 1 : angle < 180 ? 3 : angle < 270 ? 5 : 7;
}

export function phaseAt(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("phaseAt requires a valid Date");
  }
  const fraction = MoonPhase(date) / 360;
  const illumination = Illumination("Moon", date).phase_fraction;
  const previousNewMoon = SearchMoonPhase(0, date, -35);
  if (!previousNewMoon) throw new Error("Could not locate previous new moon");
  const age = (date.getTime() - previousNewMoon.date.getTime()) / 86400000;
  const phaseIndex = phaseIndexAt(fraction);
  return { fraction, illumination, age, phaseIndex, phaseName: PHASES[phaseIndex] };
}

export function parseInstant(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new RangeError("Invalid instant");
    return new Date(value);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return utcMidnight(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new RangeError("Timestamp must be an ISO UTC instant");
  }
  utcMidnight(value.slice(0, 10));
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,19) !== value.slice(0,19)) {
    throw new RangeError("Invalid instant");
  }
  return date;
}

export function utcMidnight(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new RangeError("Date must use YYYY-MM-DD");
  }

  const instant = new Date(dateString + "T00:00:00.000Z");
  if (
    Number.isNaN(instant.getTime())
    || instant.toISOString().slice(0, 10) !== dateString
  ) {
    throw new RangeError("Invalid calendar date: " + dateString);
  }
  return instant;
}

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const attr = (value) => escapeXml(value);

function fixed(value) {
  if (!Number.isFinite(value)) {
    throw new RangeError("SVG geometry must be finite");
  }
  return value.toFixed(2);
}

export function lunarDiscPath(fraction, cx, cy, radius, illumination) {
  const waxing = fraction <= 0.5;
  const terminator = 1 - 2 * illumination;
  const samples = 96;
  const outer = [];
  const inner = [];

  for (let index = 0; index <= samples; index += 1) {
    const y = -radius + (2 * radius * index) / samples;
    const span = Math.sqrt(Math.max(0, radius ** 2 - y ** 2));
    const outerX = waxing ? span : -span;
    const innerX = waxing ? terminator * span : -terminator * span;
    outer.push([cx + outerX, cy + y]);
    inner.unshift([cx + innerX, cy + y]);
  }

  return [...outer, ...inner]
    .map(([x, y], index) => (index === 0 ? "M" : "L") + fixed(x) + " " + fixed(y))
    .join(" ") + " Z";
}


const lettering = JSON.parse(readFileSync(new URL("./lunar-lettering.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""));

// Glyph outlines keep daily CI output independent of installed fonts.
function outlineText(text, { x, y, size = 100, width, height, style = "display", fill = "#109EF2", shadow = false }) {
  let cursor = 0;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const shapes = [];
  for (const character of text) {
    const glyph = lettering[style][character];
    if (!glyph) throw new RangeError("Unsupported lettering character: " + character);
    if (glyph.d) {
      const [gx, gy, gw, gh] = glyph.bounds;
      left = Math.min(left, cursor + gx);
      right = Math.max(right, cursor + gx + gw);
      top = Math.min(top, gy);
      bottom = Math.max(bottom, gy + gh);
      shapes.push('<path transform="translate(' + fixed(cursor) + ' 0)" d="' + attr(glyph.d) + '"/>');
    }
    cursor += glyph.advance;
  }
  const sx = width ? width / (right - left) : size / 100;
  const sy = height ? height / (bottom - top) : size / 100;
  const tx = width ? x - left * sx : x;
  const ty = height ? y - top * sy : y;
  const geometry = '<g transform="translate(' + fixed(tx) + ' ' + fixed(ty) + ') scale(' + fixed(sx) + ' ' + fixed(sy) + ')">' + shapes.join("") + '</g>';
  return '<g role="img" aria-label="' + attr(text) + '">'
    + (shadow ? '<g fill="#083D85" transform="translate(6 5)">' + geometry + '</g>' : '')
    + '<g fill="' + fill + '">' + geometry + '</g></g>';
}

export function renderSvg(dateString, data = phaseAt(parseInstant(dateString)), themeName = "light") {
  const instant = parseInstant(dateString);
  dateString = instant.toISOString().slice(0, 10);
  const timeLabel = instant.toISOString().slice(11, 16);
  if (!["light", "dark"].includes(themeName)) throw new RangeError("Unknown theme: " + themeName);
  const illumination = Math.round(data.illumination * 100) + "%";
  const [firstWord, secondWord] = data.phaseName.split(" ");
  const moonPath = lunarDiscPath(data.fraction, 160, 132, 82, data.illumination);
  const [year, month, day] = dateString.split("-");
  // Transparent canvas blends with GitHub; small labels adapt to its theme.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="980" height="360" viewBox="0 0 980 360" role="img" aria-labelledby="title desc">
<title id="title">Current lunar phase: ${attr(data.phaseName)}</title>
<desc id="desc">${illumination} illuminated on ${dateString} at ${timeLabel} UTC; geocentric illumination calculated with Astronomy Engine.</desc>
<defs><clipPath id="angular-edge"><path d="M0 72L470 0L350 288L0 360Z"/></clipPath><clipPath id="frame"><rect width="980" height="360"/></clipPath></defs>
<g clip-path="url(#frame)">

<path d="M0 72L470 0L350 288L0 360Z" fill="#109EF2"/>
<path d="M0 300C99 324 221 284 277 218C314 174 334 89 333 0H379C382 118 348 218 284 279C208 351 113 379 0 353Z" fill="#54C8FA" clip-path="url(#angular-edge)"/>
${outlineText("LUNAR PHASE", {x:30, y:92, size:14, style:"serif", fill:"#ffffff"})}
<g transform="translate(28 24) scale(1.2)">
<circle cx="160" cy="132" r="82" fill="#0750E8"/>
<path d="${moonPath}" fill="#ffffff"/>
</g>
${outlineText(day + " / " + month + " " + year + " · " + timeLabel + " UTC", {x:30, y:300, size:15, style:"serif", fill:"#ffffff"})}
${outlineText(firstWord, {x:488, y:48, width:firstWord.length * 45, height:44, shadow:true})}
${outlineText(secondWord, {x:488, y:106, width:secondWord.length * 52.25, height:55, shadow:true})}
${outlineText(illumination, {x:488, y:181, width:illumination.length * 80, height:88, shadow:true})}
${outlineText("ILLUMINATED", {x:493, y:295, size:15, fill:themeName === "dark" ? "#B9D8F4" : "#083D85"})}
<path d="M887 348L976 267L961 348Z" fill="#109EF2"/>
</g></svg>
`;
}


function parseArgs(argv) {
  let dateString = new Date().toISOString();
  let outputDirectory = "assets";

  for (let index = 0; index < argv.length; index += 1) {
    if ((argv[index] === "--date" || argv[index] === "--at") && argv[index + 1]) {
      dateString = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--output-dir" && argv[index + 1]) {
      outputDirectory = argv[index + 1];
      index += 1;
    } else {
      throw new Error("Unknown or incomplete argument: " + argv[index]);
    }
  }

  parseInstant(dateString);
  return { dateString, outputDirectory };
}

export function main(argv = process.argv.slice(2)) {
  const { dateString, outputDirectory } = parseArgs(argv);
  const destinationDirectory = resolve(outputDirectory);
  const data = phaseAt(parseInstant(dateString));
  mkdirSync(destinationDirectory, { recursive: true });

  for (const themeName of Object.keys(THEMES)) {
    const destination = resolve(destinationDirectory, "lunar-status-" + themeName + ".svg");
    writeFileSync(destination, renderSvg(dateString, data, themeName), "utf8");
  }

  writeFileSync(
    resolve(destinationDirectory, "lunar-status.svg"),
    renderSvg(dateString, data, "light"),
    "utf8",
  );
  process.stdout.write("Updated lunar status themes for " + dateString + " (UTC snapshot)\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}

