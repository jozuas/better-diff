// Mutes a colour as Paseo mutes its file icons' colours: scales its chroma in Oklab to 65%, which
// keeps its lightness and hue. Takes and gives #rrggbb.

type Rgb = [number, number, number];

interface Oklab {
  lightness: number;
  a: number;
  b: number;
}

const chroma = 0.65;

// sRGB's transfer function: the light a channel's value stands for, and the value for an amount of
// light.
function lightOf(value: number): number {
  // Stryker disable next-line EqualityOperator: the curve's two pieces meet at the threshold, and no channel's value is on it.
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function valueFor(light: number): number {
  // Stryker disable next-line EqualityOperator: the curve's two pieces meet at the threshold.
  return light <= 0.0031308 ? 12.92 * light : 1.055 * light ** (1 / 2.4) - 0.055;
}

function oklab([red, green, blue]: Rgb): Oklab {
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);

  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function rgb({ lightness, a, b }: Oklab): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function lightIn(colour: string, start: number): number {
  return lightOf(Number.parseInt(colour.slice(start, start + 2), 16) / 255);
}

function hex(light: number): string {
  return Math.min(255, Math.max(0, Math.round(255 * valueFor(light))))
    .toString(16)
    .padStart(2, "0");
}

export function mutedColour(colour: string): string {
  const { lightness, a, b } = oklab([lightIn(colour, 1), lightIn(colour, 3), lightIn(colour, 5)]);

  return `#${rgb({ lightness, a: a * chroma, b: b * chroma })
    .map(hex)
    .join("")}`;
}
