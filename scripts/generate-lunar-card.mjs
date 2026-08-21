import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
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
    moonDark: "#28362E",
    moonMid: "#718078",
    moonLight: "#D6E66B",
    accent: "#4F6900",
    violet: "#5A35C8",
    terrain: "#F8FAF7",
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
    violet: "#8D72FF",
    terrain: "#F5F7F3",
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

  return {
    fraction,
    illumination,
    age: fraction * SYNODIC_MONTH,
    phaseIndex: phaseIndexAt(fraction),
    phaseName: PHASES[phaseIndexAt(fraction)],
  };
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

function lunarDiscPath(fraction, cx, cy, radius) {
  const waxing = fraction <= 0.5;
  const terminator = Math.cos(TAU * fraction);
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

function terrainMarkup(cx, cy, radius, theme) {
  const patchOne = "M" + fixed(cx - radius * 0.60) + " " + fixed(cy - radius * 0.24)
    + " C" + fixed(cx - radius * 0.48) + " " + fixed(cy - radius * 0.48)
    + " " + fixed(cx - radius * 0.16) + " " + fixed(cy - radius * 0.52)
    + " " + fixed(cx + radius * 0.02) + " " + fixed(cy - radius * 0.34)
    + " C" + fixed(cx + radius * 0.16) + " " + fixed(cy - radius * 0.18)
    + " " + fixed(cx - radius * 0.04) + " " + fixed(cy - radius * 0.02)
    + " " + fixed(cx - radius * 0.28) + " " + fixed(cy - radius * 0.05)
    + " C" + fixed(cx - radius * 0.46) + " " + fixed(cy - radius * 0.07)
    + " " + fixed(cx - radius * 0.56) + " " + fixed(cy - radius * 0.14)
    + " " + fixed(cx - radius * 0.60) + " " + fixed(cy - radius * 0.24) + " Z";
  const patchTwo = "M" + fixed(cx + radius * 0.08) + " " + fixed(cy + radius * 0.30)
    + " C" + fixed(cx + radius * 0.28) + " " + fixed(cy + radius * 0.10)
    + " " + fixed(cx + radius * 0.62) + " " + fixed(cy + radius * 0.15)
    + " " + fixed(cx + radius * 0.70) + " " + fixed(cy + radius * 0.38)
    + " C" + fixed(cx + radius * 0.62) + " " + fixed(cy + radius * 0.58)
    + " " + fixed(cx + radius * 0.26) + " " + fixed(cy + radius * 0.58)
    + " " + fixed(cx + radius * 0.08) + " " + fixed(cy + radius * 0.30) + " Z";
  const patchMarkup = [
    '<path d="' + patchOne + '" fill="' + theme.moonMid + '" fill-opacity="0.16"/>',
    '<path d="' + patchTwo + '" fill="' + theme.moonMid + '" fill-opacity="0.11"/>',
  ].join("\n    ");

  const contours = [-0.52, -0.24, 0.08, 0.39].map((offset, index) => {
    const y = cy + offset * radius;
    const bend = radius * (0.04 + (index % 2) * 0.025);
    const d = "M" + fixed(cx - radius * 0.82) + " " + fixed(y)
      + " C" + fixed(cx - radius * 0.48) + " " + fixed(y - bend)
      + " " + fixed(cx - radius * 0.18) + " " + fixed(y + bend)
      + " " + fixed(cx + radius * 0.10) + " " + fixed(y)
      + " S" + fixed(cx + radius * 0.54) + " " + fixed(y - bend)
      + " " + fixed(cx + radius * 0.82) + " " + fixed(y + bend * 0.12);
    return '<path d="' + d + '" fill="none" stroke="' + theme.terrain
      + '" stroke-opacity="' + (index === 1 ? "0.22" : "0.13")
      + '" stroke-width="' + (index === 1 ? "1.1" : "0.75") + '"/>';
  }).join("\n    ");

  return patchMarkup + "\n    " + contours;
}

function cardText({ x, y, text, theme, size = 12, weight = 500, anchor = "start", fill = theme.ink, letterSpacing = 0 }) {
  return '<text x="' + x + '" y="' + y + '" fill="' + fill
    + '" font-family="ui-monospace, Consolas, monospace" font-size="' + size
    + '" font-weight="' + weight + '" text-anchor="' + anchor
    + '" letter-spacing="' + letterSpacing + '">' + attr(text) + "</text>";
}

const PIXEL_GLYPHS = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["110", "001", "010", "100", "111"],
  "3": ["110", "001", "010", "001", "110"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "110", "001", "110"],
  "6": ["011", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "110"],
  "-": ["000", "000", "111", "000", "000"],
  "/": ["001", "001", "010", "100", "100"],
  "U": ["101", "101", "101", "101", "111"],
  "T": ["111", "010", "010", "010", "010"],
  "C": ["111", "100", "100", "100", "111"],
  " ": ["000", "000", "000", "000", "000"],
};

function pixelText(text, { x, y, scale = 2, fill = "#fff" }) {
  const glyphs = String(text).split("").map((character) => {
    const glyph = PIXEL_GLYPHS[character];
    if (!glyph) throw new RangeError("Unsupported pixel glyph: " + character);
    return glyph;
  });
  const markup = [];
  let cursor = x;

  for (const glyph of glyphs) {
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] === "1") {
          markup.push(
            '<rect x="' + fixed(cursor + column * scale)
              + '" y="' + fixed(y + row * scale)
              + '" width="' + fixed(scale)
              + '" height="' + fixed(scale) + '"/>',
          );
        }
      }
    }
    cursor += 4 * scale;
  }

  return '<g fill="' + fill + '" shape-rendering="crispEdges" aria-label="'
    + attr(text) + '">' + markup.join("") + "</g>";
}

export function renderSvg(
  dateString,
  data = phaseAt(utcMidnight(dateString)),
  themeName = "light",
) {
  const theme = THEMES[themeName];
  if (!theme) throw new RangeError("Unknown theme: " + themeName);

  const illumination = Math.round(data.illumination * 100) + "%";
  const moonPath = lunarDiscPath(data.fraction, 190, 110, 72);
  const title = "Current lunar phase: " + data.phaseName;
  const description = illumination + " illuminated on " + dateString
    + "; approximate geocentric model.";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="980" height="220" viewBox="0 0 980 220" role="img" aria-labelledby="title desc">
  <title id="title">${attr(title)}</title>
  <desc id="desc">${attr(description)}</desc>
  <defs>
    <linearGradient id="moon-light-${themeName}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${theme.moonLight}"/>
      <stop offset="0.68" stop-color="${theme.accent}"/>
      <stop offset="1" stop-color="${theme.moonMid}"/>
    </linearGradient>
    <clipPath id="moon-clip-${themeName}"><circle cx="190" cy="110" r="72"/></clipPath>
  </defs>

  <path d="M22 18V86M22 148V202M22 202H190M250 202H350" fill="none" stroke="${theme.line}" stroke-opacity="0.58" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
  <path d="M958 58V112M958 150V202M958 202H824M760 202H690" fill="none" stroke="${theme.line}" stroke-opacity="0.58" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
  <path d="M42 18V36M58 18V30M936 76H958" fill="none" stroke="${theme.violet}" stroke-opacity="0.56" stroke-width="1.2" vector-effect="non-scaling-stroke"/>

  ${cardText({ x: 46, y: 44, text: "LUNAR STATUS", theme, size: 10, weight: 700, fill: theme.soft, letterSpacing: 1.2 })}

  <path d="M190 24V38M190 182V196M104 110H118M262 110H276" fill="none" stroke="${theme.soft}" stroke-opacity="0.4" stroke-width="1" vector-effect="non-scaling-stroke"/>
  <circle cx="190" cy="110" r="84" fill="none" stroke="${theme.violet}" stroke-opacity="0.32" stroke-width="1" stroke-dasharray="2 12" vector-effect="non-scaling-stroke"/>
  <circle cx="190" cy="110" r="76" fill="none" stroke="${theme.soft}" stroke-opacity="0.25" stroke-width="1" stroke-dasharray="1 9" vector-effect="non-scaling-stroke"/>
  <circle cx="190" cy="110" r="72" fill="${theme.moonDark}" fill-opacity="0.95" stroke="${theme.line}" stroke-opacity="0.76" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
  <path d="${moonPath}" fill="url(#moon-light-${themeName})"/>
  <g clip-path="url(#moon-clip-${themeName})">
    ${terrainMarkup(190, 110, 72, theme)}
  </g>
  <circle cx="190" cy="110" r="72" fill="none" stroke="${theme.paper}" stroke-opacity="0.72" stroke-width="1.1" vector-effect="non-scaling-stroke"/>

  <path d="M340 54H936" fill="none" stroke="${theme.soft}" stroke-opacity="0.28" stroke-width="1" vector-effect="non-scaling-stroke"/>
  ${cardText({ x: 340, y: 96, text: data.phaseName, theme, size: 35, weight: 800, fill: theme.ink, letterSpacing: 0.4 })}
  ${cardText({ x: 340, y: 150, text: illumination, theme, size: 62, weight: 800, fill: theme.accent })}
  <path d="M340 168H484" fill="none" stroke="${theme.accent}" stroke-opacity="0.78" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
  ${pixelText(dateString + " / UTC", { x: 340, y: 181, scale: 2, fill: theme.soft })}
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
      throw new Error("Unknown or incomplete argument: " + argv[index]);
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
    const destination = resolve(destinationDirectory, "lunar-status-" + themeName + ".svg");
    writeFileSync(destination, renderSvg(dateString, data, themeName), "utf8");
  }

  writeFileSync(
    resolve(destinationDirectory, "lunar-status.svg"),
    renderSvg(dateString, data, "light"),
    "utf8",
  );
  process.stdout.write("Updated lunar status themes for " + dateString + " at UTC midnight\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
