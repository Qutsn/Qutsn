import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const SYNODIC_MONTH = 29.530588853;

const PHASES = [
  ["NEW MOON", "新月"],
  ["WAXING CRESCENT", "娥眉月"],
  ["FIRST QUARTER", "上弦月"],
  ["WAXING GIBBOUS", "盈凸月"],
  ["FULL MOON", "满月"],
  ["WANING GIBBOUS", "亏凸月"],
  ["LAST QUARTER", "下弦月"],
  ["WANING CRESCENT", "残月"],
];

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
    phaseName: PHASES[phaseIndex][0],
    phaseNameZh: PHASES[phaseIndex][1],
  };
}

export function utcNoon(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new RangeError("Date must use YYYY-MM-DD");
  }

  const instant = new Date(`${dateString}T12:00:00.000Z`);
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
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${fixed(x)} ${fixed(y)}`)
    .join(" ") + " Z";
}

function phaseTicks(activeIndex, cx, cy, radius) {
  return Array.from({ length: 8 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * TAU) / 8;
    const inner = radius + 11;
    const outer = radius + (index === activeIndex ? 22 : 17);
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * outer;
    const y2 = cy + Math.sin(angle) * outer;
    const color = index === activeIndex ? "#C8F53A" : "#47504A";
    const width = index === activeIndex ? 4 : 2;
    return `<line x1="${fixed(x1)}" y1="${fixed(y1)}" x2="${fixed(x2)}" y2="${fixed(y2)}" stroke="${color}" stroke-width="${width}"/>`;
  }).join("\n    ");
}

export function renderSvg(dateString, data = phaseAt(utcNoon(dateString))) {
  const phaseName = escapeXml(data.phaseName);
  const phaseNameZh = escapeXml(data.phaseNameZh);
  const illumination = `${Math.round(data.illumination * 100)}%`;
  const age = `${data.age.toFixed(1)} D`;
  const moonPath = lunarDiscPath(data.fraction, 142, 132, 72);
  const title = `Current lunar phase: ${data.phaseName}`;
  const description = `${illumination} illuminated on ${dateString} at 12:00 UTC; approximate geocentric model.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="280" viewBox="0 0 860 280" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  <rect width="860" height="280" fill="#F04A37"/>
  <path d="M12 0H830L860 30V280H12Z" fill="#0A0D0C"/>
  <path d="M12 1H829L859 31V279H12Z" fill="none" stroke="#303632" stroke-width="2"/>
  <path d="M263 0V280M278 0V280" stroke="#202622" stroke-width="1"/>
  <rect x="263" y="0" width="15" height="42" fill="#F04A37"/>
  <rect x="817" y="24" width="18" height="18" fill="#C8F53A"/>
  <rect x="805" y="48" width="30" height="4" fill="#53C8C1"/>

  <circle cx="142" cy="132" r="91" fill="none" stroke="#303632" stroke-width="1"/>
  ${phaseTicks(data.phaseIndex, 142, 132, 91)}
  <circle cx="142" cy="132" r="72" fill="#171C19"/>
  <path d="${moonPath}" fill="#C8F53A"/>
  <circle cx="142" cy="132" r="72" fill="none" stroke="#F2F0E8" stroke-opacity="0.7" stroke-width="1.5"/>
  <text x="40" y="250" fill="#53C8C1" font-family="ui-monospace, Consolas, monospace" font-size="12">CYCLE / ${escapeXml(String(data.phaseIndex + 1).padStart(2, "0"))}.08</text>

  <text x="300" y="38" fill="#53C8C1" font-family="ui-monospace, Consolas, monospace" font-size="13">CELESTIAL STATUS / NODE 01</text>
  <text x="300" y="83" fill="#F2F0E8" font-family="Arial, sans-serif" font-size="30" font-weight="700">${phaseName}</text>
  <text x="300" y="111" fill="#C8F53A" font-family="Arial, sans-serif" font-size="17" font-weight="600">${phaseNameZh}</text>
  <text x="799" y="72" fill="#717B74" font-family="ui-monospace, Consolas, monospace" font-size="10" text-anchor="end">UTC / 12:00</text>
  <text x="799" y="87" fill="#717B74" font-family="ui-monospace, Consolas, monospace" font-size="10" text-anchor="end">GEOCENTRIC / APPROX.</text>

  <path d="M300 132H816" stroke="#303632" stroke-width="1"/>
  <path d="M470 145V192M640 145V192" stroke="#303632" stroke-width="1"/>
  <text x="300" y="154" fill="#717B74" font-family="ui-monospace, Consolas, monospace" font-size="11">ILLUMINATION</text>
  <text x="300" y="184" fill="#F2F0E8" font-family="ui-monospace, Consolas, monospace" font-size="24" font-weight="700">${escapeXml(illumination)}</text>
  <text x="490" y="154" fill="#717B74" font-family="ui-monospace, Consolas, monospace" font-size="11">LUNAR AGE</text>
  <text x="490" y="184" fill="#F2F0E8" font-family="ui-monospace, Consolas, monospace" font-size="24" font-weight="700">${escapeXml(age)}</text>
  <text x="660" y="154" fill="#717B74" font-family="ui-monospace, Consolas, monospace" font-size="11">UPDATED</text>
  <text x="660" y="184" fill="#F2F0E8" font-family="ui-monospace, Consolas, monospace" font-size="18" font-weight="700">${escapeXml(dateString)}</text>

  <rect x="300" y="218" width="516" height="34" fill="#171C19"/>
  <rect x="300" y="218" width="8" height="34" fill="#C8F53A"/>
  <text x="326" y="240" fill="#F2F0E8" font-family="ui-monospace, Consolas, monospace" font-size="12">LOOKING PAST THE HORIZON</text>
  <text x="798" y="240" fill="#F04A37" font-family="ui-monospace, Consolas, monospace" font-size="12" text-anchor="end">ORBITAL PITLANE</text>
</svg>
`;
}

function parseArgs(argv) {
  let dateString = new Date().toISOString().slice(0, 10);
  let outputPath = "assets/lunar-status.svg";

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--date" && argv[index + 1]) {
      dateString = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--output" && argv[index + 1]) {
      outputPath = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
    }
  }

  utcNoon(dateString);
  return { dateString, outputPath };
}

export function main(argv = process.argv.slice(2)) {
  const { dateString, outputPath } = parseArgs(argv);
  const destination = resolve(outputPath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, renderSvg(dateString), "utf8");
  process.stdout.write(`Updated ${destination} for ${dateString}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
