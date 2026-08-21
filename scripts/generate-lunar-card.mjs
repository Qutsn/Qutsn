import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const SYNODIC_MONTH = 29.530588853;

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

const THEMES = {
  light: {
    ink: "#17201D",
    soft: "#59635D",
    line: "#17201D",
    paper: "#F8FAF7",
    moonDark: "#22302A",
    moonMid: "#68776C",
    moonLight: "#9BBE22",
    accent: "#4F6900",
    cyan: "#006A68",
    red: "#B3261E",
  },
  dark: {
    ink: "#F5F7F3",
    soft: "#AAB6AE",
    line: "#F5F7F3",
    paper: "#0B1210",
    moonDark: "#0B1210",
    moonMid: "#64736A",
    moonLight: "#D9FF4A",
    accent: "#C8F53A",
    cyan: "#6BE7DD",
    red: "#FF6B58",
  },
};

const mod = (value, base) => ((value % base) + base) % base;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function phaseIndexAt(fraction) {
  if (fraction < 1 / 32 || fraction >= 31 / 32) return 0;
  if (fraction < 7 / 32) return 1;
  if (fraction < 9 / 32) return 2;
  if (fraction < 15 / 32) return 3;
  if (fraction < 17 / 32) return 4;
  if (fraction < 23 / 32) return 5;
  if (fraction < 25 / 32) return 6;
  return 7;
}

export function julianDay(date) {
  return date.getTime() / 86_400_000 + 2_440_587.5;
}

export function phaseAt(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("phaseAt requires a valid Date");
  }

  const days = julianDay(date) - 2_451_545;
  const solarAnomaly = (357.5291 + 0.98560028 * days) * DEG;
  const solarLongitude = solarAnomaly
    + (1.9148 * Math.sin(solarAnomaly)
      + 0.02 * Math.sin(2 * solarAnomaly)
      + 0.0003 * Math.sin(3 * solarAnomaly)
      + 102.9372
      + 180) * DEG;

  const lunarMeanLongitude = (218.316 + 13.176396 * days) * DEG;
  const lunarAnomaly = (134.963 + 13.064993 * days) * DEG;
  const lunarArgument = (93.272 + 13.22935 * days) * DEG;
  const lunarLongitude = lunarMeanLongitude + 6.289 * DEG * Math.sin(lunarAnomaly);
  const lunarLatitude = 5.128 * DEG * Math.sin(lunarArgument);

  const elongation = mod(lunarLongitude - solarLongitude, TAU);
  const fraction = elongation / TAU;
  const cosineSeparation = clamp(
    Math.cos(lunarLatitude) * Math.cos(elongation),
    -1,
    1,
  );
  const illumination = clamp((1 - cosineSeparation) / 2, 0, 1);
  const phaseIndex = phaseIndexAt(fraction);

  return {
    fraction,
    illumination,
    age: fraction * SYNODIC_MONTH,
    phaseIndex,
    phaseName: PHASES[phaseIndex],
  };
}

export function utcMidnight(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new RangeError("Date must use YYYY-MM-DD");
  }

  const instant = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== dateString) {
    throw new RangeError(`Invalid calendar date: ${dateString}`);
  }
  return instant;
}

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const fixed = (value) => {
  if (!Number.isFinite(value)) {
    throw new RangeError("SVG geometry must be finite");
  }
  return value.toFixed(2);
};

const attr = (value) => escapeXml(value);

function lunarDiscPath(fraction, cx, cy, radius) {
  const waxing = fraction <= 0.5;
  const terminator = Math.cos(TAU * fraction);
  const samples = 112;
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
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${fixed(x)} ${fixed(y)}`)
    .join(" ") + " Z";
}

function phaseTicks(activeIndex, cx, cy, radius, theme) {
  return Array.from({ length: 16 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * TAU) / 16;
    const long = index % 2 === 0;
    const inner = radius + 12;
    const outer = radius + (long ? 23 : 17);
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * outer;
    const y2 = cy + Math.sin(angle) * outer;
    const active = Math.floor(index / 2) === activeIndex;
    const color = active ? theme.accent : theme.soft;
    const opacity = active ? 0.95 : 0.48;
    return `<line x1="${fixed(x1)}" y1="${fixed(y1)}" x2="${fixed(x2)}" y2="${fixed(y2)}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${active ? 3 : 1.4}"/>`;
  }).join("\n    ");
}

function surfaceMarkup(cx, cy, radius, theme) {
  const craters = [
    [-0.38, -0.34, 0.13, 0.055, -18],
    [0.12, -0.38, 0.095, 0.04, 24],
    [0.34, -0.08, 0.16, 0.065, -10],
    [-0.18, -0.04, 0.075, 0.032, 32],
    [0.05, 0.18, 0.12, 0.05, -22],
    [-0.37, 0.28, 0.10, 0.042, 12],
    [0.32, 0.38, 0.075, 0.03, 40],
    [-0.05, 0.43, 0.15, 0.05, -15],
  ];

  const craterMarkup = craters.map(([x, y, rx, ry, rotation]) => {
    const px = cx + x * radius;
    const py = cy + y * radius;
    const major = rx * radius;
    const minor = ry * radius;
    return `<g transform="rotate(${rotation} ${fixed(px)} ${fixed(py)})" opacity="0.42">
      <ellipse cx="${fixed(px)}" cy="${fixed(py)}" rx="${fixed(major)}" ry="${fixed(minor)}" fill="none" stroke="${theme.paper}" stroke-opacity="0.55" stroke-width="1.3"/>
      <path d="M${fixed(px - major * 0.86)} ${fixed(py + minor * 0.35)} Q${fixed(px)} ${fixed(py + minor * 1.45)} ${fixed(px + major * 0.82)} ${fixed(py + minor * 0.28)}" fill="none" stroke="${theme.moonDark}" stroke-opacity="0.78" stroke-width="2"/>
    </g>`;
  }).join("\n      ");

  const contourMarkup = Array.from({ length: 9 }, (_, index) => {
    const y = cy - radius * 0.72 + index * radius * 0.18;
    const amplitude = radius * (0.04 + (index % 3) * 0.012);
    const d = `M${fixed(cx - radius * 0.82)} ${fixed(y)} Q${fixed(cx - radius * 0.25)} ${fixed(y - amplitude)} ${fixed(cx + radius * 0.05)} ${fixed(y + amplitude * 0.4)} T${fixed(cx + radius * 0.82)} ${fixed(y - amplitude * 0.15)}`;
    return `<path d="${d}" fill="none" stroke="${theme.paper}" stroke-opacity="0.16" stroke-width="0.8"/>`;
  }).join("\n      ");

  return `${craterMarkup}\n      ${contourMarkup}`;
}

function telemetryMarkup(theme) {
  const marks = [
    [724, 46, 764, 46],
    [774, 46, 790, 46],
    [800, 46, 820, 46],
    [724, 54, 744, 54],
    [754, 54, 790, 54],
    [724, 272, 744, 272],
    [754, 272, 784, 272],
    [796, 272, 832, 272],
  ];
  return marks.map(([x1, y1, x2, y2], index) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${index % 3 === 0 ? theme.cyan : theme.soft}" stroke-opacity="${index % 3 === 0 ? 0.8 : 0.42}" stroke-width="${index % 3 === 0 ? 2 : 1}"/>`).join("\n  ");
}

function adaptiveText({ x, y, text, theme, size = 12, weight = 500, anchor = "start", fill = theme.ink, letterSpacing = 0 }) {
  return `<text x="${x}" y="${y}" fill="${fill}" stroke="${theme.paper}" stroke-opacity="0.8" stroke-width="${size >= 24 ? 2.4 : 1.4}" paint-order="stroke" stroke-linejoin="round" font-family="ui-monospace, Consolas, monospace" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${attr(text)}</text>`;
}

export function renderSvg(dateString, data = phaseAt(utcMidnight(dateString)), themeName = "light") {
  const theme = THEMES[themeName];
  if (!theme) throw new RangeError(`Unknown theme: ${themeName}`);

  const phaseName = attr(data.phaseName);
  const illumination = `${Math.round(data.illumination * 100)}%`;
  const age = `${data.age.toFixed(1)} D`;
  const moonPath = lunarDiscPath(data.fraction, 184, 160, 86);
  const title = `Current lunar phase: ${data.phaseName}`;
  const description = `${illumination} illuminated on ${dateString} at 00:00 GMT; approximate geocentric model.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="980" height="320" viewBox="0 0 980 320" role="img" aria-labelledby="title desc">
  <title id="title">${attr(title)}</title>
  <desc id="desc">${attr(description)}</desc>
  <defs>
    <linearGradient id="moon-light-${themeName}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${theme.moonLight}"/>
      <stop offset="0.58" stop-color="${theme.accent}"/>
      <stop offset="1" stop-color="${theme.moonMid}"/>
    </linearGradient>
    <clipPath id="moon-clip-${themeName}"><circle cx="184" cy="160" r="86"/></clipPath>
  </defs>

  <path d="M22 18H880L958 96V302H22Z" fill="none" stroke="${theme.line}" stroke-opacity="0.72" stroke-width="1.2"/>
  <path d="M22 18H880L958 96" fill="none" stroke="${theme.red}" stroke-opacity="0.92" stroke-width="3"/>
  <path d="M22 302H596M22 18V82M958 96V302" fill="none" stroke="${theme.line}" stroke-opacity="0.72" stroke-width="2"/>
  <path d="M22 52H306M344 52H596M636 52H704" fill="none" stroke="${theme.soft}" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="2 8"/>
  <path d="M22 302L92 232M880 18L958 96" fill="none" stroke="${theme.cyan}" stroke-opacity="0.7" stroke-width="1.4"/>
  <path d="M42 18V38M62 18V30M42 302V282M62 302V290M938 116H958M938 136H958" stroke="${theme.accent}" stroke-opacity="0.82" stroke-width="2"/>

  ${adaptiveText({ x: 42, y: 43, text: "ORBITAL READOUT / 01", theme, size: 11, weight: 700, fill: theme.cyan, letterSpacing: 1.1 })}
  ${adaptiveText({ x: 936, y: 43, text: "00:00 GMT", theme, size: 11, weight: 700, anchor: "end", fill: theme.red })}
  ${telemetryMarkup(theme)}

  <ellipse cx="184" cy="160" rx="119" ry="104" fill="none" stroke="${theme.soft}" stroke-opacity="0.25" stroke-width="1" stroke-dasharray="3 12"/>
  <ellipse cx="184" cy="160" rx="106" ry="94" fill="none" stroke="${theme.cyan}" stroke-opacity="0.42" stroke-width="1" stroke-dasharray="1 14"/>
  <circle cx="184" cy="160" r="98" fill="none" stroke="${theme.line}" stroke-opacity="0.66" stroke-width="1.2"/>
  ${phaseTicks(data.phaseIndex, 184, 160, 98, theme)}
  <circle cx="184" cy="160" r="86" fill="${theme.moonDark}" fill-opacity="0.92" stroke="${theme.paper}" stroke-opacity="0.72" stroke-width="2"/>
  <path d="${moonPath}" fill="url(#moon-light-${themeName})"/>
  <g clip-path="url(#moon-clip-${themeName})">
    ${surfaceMarkup(184, 160, 86, theme)}
    <path d="M98 116H270M96 132H272M96 188H272M102 208H266" stroke="${theme.paper}" stroke-opacity="0.08" stroke-width="1" stroke-dasharray="1 9"/>
  </g>
  <circle cx="184" cy="160" r="86" fill="none" stroke="${theme.paper}" stroke-opacity="0.92" stroke-width="1.5"/>
  ${adaptiveText({ x: 72, y: 278, text: `LUNAR CYCLE / ${String(data.phaseIndex + 1).padStart(2, "0")}.08`, theme, size: 10, weight: 700, fill: theme.soft, letterSpacing: 0.8 })}
  ${adaptiveText({ x: 294, y: 272, text: "SURFACE MODEL / RELIEF + TERMINATOR", theme, size: 9, weight: 600, fill: theme.soft, letterSpacing: 0.5 })}

  <path d="M348 70V270" fill="none" stroke="${theme.red}" stroke-width="4"/>
  <path d="M364 70H942M364 270H942" fill="none" stroke="${theme.soft}" stroke-opacity="0.34" stroke-width="1"/>
  ${adaptiveText({ x: 382, y: 95, text: data.phaseName, theme, size: 33, weight: 800, fill: theme.ink, letterSpacing: 0.4 })}
  ${adaptiveText({ x: 384, y: 123, text: "PHASE LOCK / GEOCENTRIC APPROX.", theme, size: 10, weight: 700, fill: theme.accent, letterSpacing: 0.7 })}

  ${adaptiveText({ x: 382, y: 182, text: illumination, theme, size: 58, weight: 800, fill: theme.accent, letterSpacing: 0 })}
  ${adaptiveText({ x: 388, y: 207, text: "ILLUMINATION", theme, size: 10, weight: 700, fill: theme.soft, letterSpacing: 1.1 })}
  <path d="M382 220H540" stroke="${theme.accent}" stroke-opacity="0.7" stroke-width="3"/>
  <path d="M382 228H494M382 236H524M382 244H466" stroke="${theme.soft}" stroke-opacity="0.3" stroke-width="1"/>

  <path d="M610 146V254M778 146V254" stroke="${theme.soft}" stroke-opacity="0.35" stroke-width="1"/>
  ${adaptiveText({ x: 570, y: 168, text: "LUNAR AGE", theme, size: 10, weight: 700, fill: theme.soft, letterSpacing: 0.9 })}
  ${adaptiveText({ x: 570, y: 201, text: age, theme, size: 25, weight: 800, fill: theme.ink })}
  ${adaptiveText({ x: 642, y: 168, text: "REFERENCE", theme, size: 10, weight: 700, fill: theme.soft, letterSpacing: 0.9 })}
  ${adaptiveText({ x: 642, y: 201, text: `${dateString} GMT`, theme, size: 16, weight: 800, fill: theme.ink })}
  ${adaptiveText({ x: 804, y: 168, text: "MODEL", theme, size: 10, weight: 700, fill: theme.soft, letterSpacing: 0.9 })}
  ${adaptiveText({ x: 804, y: 201, text: "LOW-PRECISION", theme, size: 13, weight: 800, fill: theme.ink })}
  ${adaptiveText({ x: 804, y: 219, text: "SOLAR / LUNAR", theme, size: 10, weight: 700, fill: theme.cyan, letterSpacing: 0.5 })}

  <path d="M570 250H942" stroke="${theme.soft}" stroke-opacity="0.3" stroke-width="1" stroke-dasharray="4 7"/>
  ${adaptiveText({ x: 570, y: 289, text: "LOOKING PAST THE HORIZON", theme, size: 12, weight: 800, fill: theme.ink, letterSpacing: 0.8 })}
  ${adaptiveText({ x: 938, y: 289, text: "ORBITAL PITLANE", theme, size: 10, weight: 800, anchor: "end", fill: theme.red, letterSpacing: 0.9 })}
  <path d="M570 301H690M706 301H760M776 301H942" stroke="${theme.cyan}" stroke-opacity="0.52" stroke-width="1"/>
</svg>
`;
}

function parseArgs(argv) {
  let dateString = new Date().toISOString().slice(0, 10);
  let outputDirectory = "assets";

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--date" && argv[index + 1]) {
      dateString = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--output-dir" && argv[index + 1]) {
      outputDirectory = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    }
  }

  utcMidnight(dateString);
  return { dateString, outputDirectory };
}

export function main(argv = process.argv.slice(2)) {
  const { dateString, outputDirectory } = parseArgs(argv);
  const destinationDirectory = resolve(outputDirectory);
  const data = phaseAt(utcMidnight(dateString));
  mkdirSync(destinationDirectory, { recursive: true });
  for (const themeName of Object.keys(THEMES)) {
    const destination = resolve(destinationDirectory, `lunar-status-${themeName}.svg`);
    writeFileSync(destination, renderSvg(dateString, data, themeName), "utf8");
  }
  writeFileSync(resolve(destinationDirectory, "lunar-status.svg"), renderSvg(dateString, data, "light"), "utf8");
  process.stdout.write(`Updated lunar status themes for ${dateString} at 00:00 GMT\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
