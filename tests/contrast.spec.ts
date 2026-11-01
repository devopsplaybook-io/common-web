import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packedDirectory = process.env.COMMON_WEB_PACKED_DIR;
const DEFAULT_ALERT_BACKGROUND = "#546e7a";
const AA_MINIMUM = 4.5;
const TEXT_TOKENS = [
  "color-text",
  "color-text-muted",
  "color-primary",
  "color-primary-hover",
];
const SURFACE_TOKENS = ["color-surface", "color-surface-raised"];

interface TokenValues {
  [token: string]: string;
}

function luminance(hex: string): number {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((digit) => digit + digit)
      .join("");
  }
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return (
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  );
}

function contrastRatio(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function declarationBlock(selector: string, css: string): string {
  const start = css.indexOf(selector);
  if (start === -1) {
    throw new Error(`tokens.css is missing the selector "${selector}"`);
  }
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function tokens(block: string): TokenValues {
  const values: TokenValues = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]+)/g)) {
    if (name && value) values[name] = value;
  }
  return values;
}

function requireToken(theme: TokenValues, name: string, label: string): string {
  const value = theme[name];
  if (value === undefined) throw new Error(`${label} is missing --${name}`);
  return value;
}

function expectAaCompliant(theme: TokenValues, label: string): void {
  const surfaces = SURFACE_TOKENS.map((token) =>
    requireToken(theme, token, label),
  );
  for (const token of TEXT_TOKENS) {
    const foreground = requireToken(theme, token, label);
    for (const background of surfaces) {
      const ratio = contrastRatio(foreground, background);
      expect(
        ratio,
        `${label} ${token} ${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_MINIMUM);
    }
  }

  const pairs: Array<[string, string, string]> = [
    ["success", requireToken(theme, "color-on-success", label), requireToken(theme, "color-success", label)],
    ["error", requireToken(theme, "color-on-error", label), requireToken(theme, "color-error", label)],
    ["warning", requireToken(theme, "color-on-warning", label), requireToken(theme, "color-warning", label)],
    ["default alert", requireToken(theme, "color-text-inverse", label), DEFAULT_ALERT_BACKGROUND],
  ];
  for (const [name, foreground, background] of pairs) {
    const ratio = contrastRatio(foreground, background);
    expect(
      ratio,
      `${label} ${name} ${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_MINIMUM);
  }
}

describe("text and status color contrast (WCAG AA)", () => {
  it("runs against the packed tokens.css", () => {
    expect(
      packedDirectory,
      "COMMON_WEB_PACKED_DIR is not set; run the tests through `npm test` so the packed package is verified",
    ).toBeDefined();
  });

  it("meets AA contrast for text, muted, primary, hover and status colors in light mode", () => {
    const css = readFileSync(
      resolve(packedDirectory!, "assets/css/tokens.css"),
      "utf8",
    );
    expectAaCompliant(tokens(declarationBlock(":root {", css)), "light");
  });

  it("meets AA contrast for text, muted, primary, hover and status colors in dark mode", () => {
    const css = readFileSync(
      resolve(packedDirectory!, "assets/css/tokens.css"),
      "utf8",
    );
    expectAaCompliant(
      tokens(declarationBlock(':root[data-theme="dark"] {', css)),
      "dark",
    );
    expectAaCompliant(
      tokens(declarationBlock(':root:not([data-theme="light"]) {', css)),
      "dark (prefers-color-scheme)",
    );
  });

  it("defines the primary and hover tokens in both dark blocks", () => {
    const css = readFileSync(
      resolve(packedDirectory!, "assets/css/tokens.css"),
      "utf8",
    );
    const explicit = tokens(declarationBlock(':root[data-theme="dark"] {', css));
    const media = tokens(
      declarationBlock(':root:not([data-theme="light"]) {', css),
    );

    for (const token of ["color-primary", "color-primary-hover"]) {
      expect(explicit[token], `dark is missing --${token}`).toBeDefined();
      expect(
        media[token],
        `dark (prefers-color-scheme) is missing --${token}`,
      ).toBeDefined();
    }
  });

  it("keeps both dark blocks consistent", () => {
    const css = readFileSync(
      resolve(packedDirectory!, "assets/css/tokens.css"),
      "utf8",
    );
    const explicit = tokens(declarationBlock(':root[data-theme="dark"] {', css));
    const media = tokens(
      declarationBlock(':root:not([data-theme="light"]) {', css),
    );

    for (const [token, value] of Object.entries(explicit)) {
      expect(
        media[token],
        `--${token} must match between the two dark blocks`,
      ).toBe(value);
    }
  });
});
