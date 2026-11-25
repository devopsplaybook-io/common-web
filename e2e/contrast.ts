/**
 * Colour parsing and WCAG 2.2 relative-luminance / contrast helpers.
 *
 * These run in Node against colours read with `getComputedStyle` inside the
 * page, so the browser resolves the whole CSS cascade (`var()`,
 * `light-dark()`, `color-mix()`) before we measure.
 */

export interface Rgba {
  r: number; // 0..255
  g: number;
  b: number;
  a: number; // 0..1
}

const HEX_PATTERN = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_FUNCTION_PATTERN = /^rgba?\((.+)\)$/i;
const COLOR_FUNCTION_PATTERN = /^color\(\s*([a-z0-9-]+)\s+(.+)\)$/i;
const NAMED_WHITE = { r: 255, g: 255, b: 255, a: 1 } as const;
const NAMED_BLACK = { r: 0, g: 0, b: 0, a: 1 } as const;
const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 } as const;

/** White behind an element chain that never resolves an opaque background. */
export const CANVAS_FALLBACK: Rgba = { ...NAMED_WHITE };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function componentsOf(value: string): string[] {
  return value.replace(/\//g, " ").split(/[\s,]+/).filter(Boolean);
}

function rgbaFromHex(value: string): Rgba {
  let hex = value.slice(1);
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((digit) => digit + digit).join("");
  }
  const channel = (offset: number): number =>
    Number.parseInt(hex.slice(offset, offset + 2), 16);
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: hex.length === 8 ? channel(6) / 255 : 1,
  };
}

function parseRgbChannel(value: string, input: string): number {
  const channel = value.endsWith("%")
    ? (Number.parseFloat(value) / 100) * 255
    : Number.parseFloat(value);
  if (!Number.isFinite(channel)) {
    throw new Error(`Unsupported colour channel "${value}" in "${input}"`);
  }
  return clamp(channel, 0, 255);
}

function parseAlpha(value: string, input: string): number {
  const alpha = value.endsWith("%")
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value);
  if (!Number.isFinite(alpha)) {
    throw new Error(`Unsupported colour alpha "${value}" in "${input}"`);
  }
  return clamp(alpha, 0, 1);
}

function parseUnitChannel(value: string, input: string): number {
  const channel = value.endsWith("%")
    ? Number.parseFloat(value) / 100
    : Number.parseFloat(value);
  if (!Number.isFinite(channel)) {
    throw new Error(`Unsupported colour channel "${value}" in "${input}"`);
  }
  return clamp(channel, 0, 255 / 255) * 255;
}

export function parseColor(input: string): Rgba {
  const value = input.trim().toLowerCase();
  if (!value) throw new Error("Empty colour value");
  if (value === "transparent") return { ...TRANSPARENT };
  if (value === "white") return { ...NAMED_WHITE };
  if (value === "black") return { ...NAMED_BLACK };
  if (HEX_PATTERN.test(value)) return rgbaFromHex(value);

  const rgbMatch = RGB_FUNCTION_PATTERN.exec(value);
  if (rgbMatch) {
    const parts = componentsOf(rgbMatch[1] ?? "");
    if (parts.length < 3) throw new Error(`Unsupported colour value "${input}"`);
    const [red, green, blue, alpha] = parts as [string, string, string, string?];
    return {
      r: parseRgbChannel(red, input),
      g: parseRgbChannel(green, input),
      b: parseRgbChannel(blue, input),
      a: alpha === undefined ? 1 : parseAlpha(alpha, input),
    };
  }

  const colorMatch = COLOR_FUNCTION_PATTERN.exec(value);
  if (colorMatch) {
    const space = colorMatch[1];
    if (space !== "srgb") {
      throw new Error(`Unsupported colour space "${space}" in "${input}"`);
    }
    const parts = componentsOf(colorMatch[2] ?? "");
    if (parts.length < 3) throw new Error(`Unsupported colour value "${input}"`);
    const [red, green, blue, alpha] = parts as [string, string, string, string?];
    return {
      r: parseUnitChannel(red, input),
      g: parseUnitChannel(green, input),
      b: parseUnitChannel(blue, input),
      a: alpha === undefined ? 1 : parseAlpha(alpha, input),
    };
  }

  throw new Error(`Unsupported colour value "${input}"`);
}

/** Alpha-composite `foreground` over `background` (both may be translucent). */
export function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) return { ...TRANSPARENT };
  const mix = (top: number, bottom: number): number =>
    (top * foreground.a + bottom * background.a * (1 - foreground.a)) / alpha;
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a: alpha,
  };
}

/**
 * Composite a stack of background colours read from an element up to the
 * document root (element first, root last) over the canvas fallback.
 */
export function compositeChain(chain: readonly string[]): Rgba {
  let result: Rgba = { ...CANVAS_FALLBACK };
  for (const color of [...chain].reverse()) {
    result = composite(parseColor(color), result);
  }
  return result;
}

function channelLuminance(channel: number): number {
  const value = clamp(channel / 255, 0, 1);
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance (0.03928 sRGB threshold). */
export function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

export function contrastRatio(first: Rgba, second: Rgba): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function formatColor(color: Rgba): string {
  const channels = [color.r, color.g, color.b].map((channel) => Math.round(channel));
  const base = `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
  return color.a < 1 ? `${base} / ${color.a.toFixed(2)}` : base;
}

export function sameColor(
  first: Rgba,
  second: Rgba,
  tolerance = 1.5,
): boolean {
  return (
    Math.abs(first.r - second.r) <= tolerance &&
    Math.abs(first.g - second.g) <= tolerance &&
    Math.abs(first.b - second.b) <= tolerance &&
    Math.abs(first.a - second.a) <= 0.01
  );
}
