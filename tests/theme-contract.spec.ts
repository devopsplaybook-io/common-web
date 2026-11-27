import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss, { type Declaration, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = process.env.COMMON_WEB_PACKED_DIR ?? process.cwd();

const COMPONENTS = [
  "components/LoginWithCodeCard.vue",
  "components/AuthorizeDeviceCard.vue",
  "components/LoginCodeInput.vue",
] as const;

const CARD_CLASSES: Record<string, string> = {
  "components/LoginWithCodeCard.vue": "login-with-code-card",
  "components/AuthorizeDeviceCard.vue": "authorize-device-card",
};

const CARD_CHROME = [
  "background",
  "border",
  "border-radius",
  "box-shadow",
  "padding",
];

// Host tokens the components are allowed to consume (documented contract).
const HOST_TOKENS = new Set([
  "color-surface",
  "color-surface-raised",
  "color-text",
  "color-text-muted",
  "color-border",
  "color-primary",
  "color-primary-hover",
  "color-on-primary",
  "color-warning",
  "color-error",
  "color-danger",
  "color-success",
  "color-text-inverse",
  "color-on-success",
  "color-on-error",
  "color-on-warning",
]);

// `--color-danger` is documented as the optional alias for `--color-error`.
const OPTIONAL_HOST_TOKENS = new Set(["color-danger"]);

const COLOUR_PROPERTIES = new Set([
  "color",
  "background",
  "background-color",
  "border",
  "border-color",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline",
  "outline-color",
]);

const ALLOWED_KEYWORDS =
  /\b(?:transparent|inherit|initial|unset|revert|revert-layer|currentcolor|none)\b/gi;

const NAMED_COLOURS = [
  "black",
  "white",
  "red",
  "green",
  "blue",
  "gray",
  "grey",
  "yellow",
  "orange",
  "purple",
  "pink",
  "brown",
  "silver",
  "gold",
  "navy",
  "teal",
  "olive",
  "maroon",
  "lime",
  "aqua",
  "fuchsia",
  "cyan",
  "magenta",
  "beige",
  "ivory",
  "khaki",
  "coral",
  "salmon",
  "crimson",
  "indigo",
  "violet",
  "wheat",
  "tan",
  "azure",
  "lavender",
];

function sourceOf(file: string): string {
  return readFileSync(resolve(SOURCE_ROOT, file), "utf8");
}

function styleBlockOf(file: string): string {
  const match = sourceOf(file).match(/<style[^>]*>([\s\S]*?)<\/style>/);
  if (!match) throw new Error(`${file} has no <style> block`);
  return match[1]!;
}

function parseStyle(file: string) {
  return postcss.parse(styleBlockOf(file));
}

function stripVarReferences(value: string): string {
  let current = value;
  let previous = "";
  while (current !== previous) {
    previous = current;
    current = current.replace(/var\([^()]*\)/gi, " ");
  }
  return current;
}

function rawColour(value: string): string | null {
  const stripped = stripVarReferences(value).replace(ALLOWED_KEYWORDS, " ");
  const hex = stripped.match(/#[0-9a-fA-F]{3,8}\b/);
  if (hex) return hex[0];
  const fn = stripped.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i);
  if (fn) return fn[0];
  for (const name of NAMED_COLOURS) {
    if (new RegExp(`\\b${name}\\b`, "i").test(stripped)) return name;
  }
  return null;
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

function declaredProperties(css: string): Set<string> {
  const props = new Set<string>();
  postcss.parse(css).walkDecls((declaration: Declaration) => {
    props.add(declaration.prop);
  });
  return props;
}

describe("theme contract", () => {
  it("uses no raw colour literals in colour declarations", () => {
    for (const file of COMPONENTS) {
      parseStyle(file).walkDecls((declaration: Declaration) => {
        if (declaration.prop.startsWith("--")) return;
        if (!COLOUR_PROPERTIES.has(declaration.prop)) return;
        const literal = rawColour(declaration.value);
        expect(
          literal,
          `${file}: "${declaration.prop}: ${declaration.value}" uses the raw colour "${literal}"`,
        ).toBeNull();
      });
    }
  });

  it("only consumes documented host tokens and declares them in tokens.css", () => {
    const tokensCss = readFileSync(
      resolve(SOURCE_ROOT, "assets/css/tokens.css"),
      "utf8",
    );
    const declared = declaredProperties(tokensCss);

    for (const file of COMPONENTS) {
      const css = styleBlockOf(file);
      for (const [, token] of css.matchAll(/var\(\s*--(color-[\w-]+)/g)) {
        expect(
          HOST_TOKENS.has(token!),
          `${file} references the undocumented host token --${token}`,
        ).toBe(true);
        if (OPTIONAL_HOST_TOKENS.has(token!)) continue;
        expect(
          declared.has(`--${token}`),
          `${file} references --${token}, which assets/css/tokens.css does not define`,
        ).toBe(true);
      }
    }
  });

  it("ships --color-on-primary in the light and both dark token blocks", () => {
    const tokensCss = readFileSync(
      resolve(SOURCE_ROOT, "assets/css/tokens.css"),
      "utf8",
    );
    for (const [label, selector] of [
      ["light", ":root {"],
      ["dark", ':root[data-theme="dark"] {'],
      ["dark (prefers-color-scheme)", ':root:not([data-theme="light"]) {'],
    ] as const) {
      const block = declarationBlock(selector, tokensCss);
      expect(block, `${label} is missing --color-on-primary`).toContain(
        "--color-on-primary:",
      );
    }
  });

  it("bridges spacing through --lc-space", () => {
    for (const file of COMPONENTS) {
      const root = parseStyle(file);
      const bridges: string[] = [];
      root.walkDecls(/^--lc-space$/, (declaration: Declaration) => {
        bridges.push(declaration.value);
      });
      expect(
        bridges.join(" "),
        `${file} must define --lc-space: var(--space-base, var(--space-md, 1rem))`,
      ).toContain("var(--space-base, var(--space-md, 1rem))");

      root.walkDecls((declaration: Declaration) => {
        if (declaration.prop.startsWith("--lc-space")) return;
        expect(
          declaration.value,
          `${file}: "${declaration.prop}" bypasses the --lc-space bridge`,
        ).not.toMatch(/var\(\s*--space-/);
      });
    }
  });

  it("defines the lc-theme layer in every component", () => {
    for (const file of COMPONENTS) {
      let defined = false;
      parseStyle(file).walkRules((rule: Rule) => {
        if (rule.selectors.includes(".lc-theme")) defined = true;
      });
      expect(defined, `${file} must define the .lc-theme token layer`).toBe(
        true,
      );
    }
  });

  it("declares every --lc-* variable it consumes", () => {
    for (const file of COMPONENTS) {
      const css = styleBlockOf(file);
      const declared = declaredProperties(css);
      for (const [, token] of css.matchAll(/var\(\s*--(lc-[\w-]+)/g)) {
        expect(
          declared.has(`--${token}`),
          `${file} consumes --${token} without declaring it`,
        ).toBe(true);
      }
    }
  });

  it("keeps card chrome on the --card variant so plain drops it", () => {
    for (const [file, base] of Object.entries(CARD_CLASSES)) {
      const rules: Record<string, Rule> = {};
      parseStyle(file).walkRules((rule: Rule) => {
        rules[rule.selector] = rule;
      });

      const baseRule = rules[`.${base}`];
      const cardRule = rules[`.${base}--card`];
      expect(baseRule, `${file} must define .${base}`).toBeDefined();
      expect(cardRule, `${file} must define .${base}--card`).toBeDefined();

      const cardProps = new Set<string>();
      cardRule!.walkDecls((declaration: Declaration) => {
        cardProps.add(declaration.prop);
      });
      const baseProps = new Set<string>();
      baseRule!.walkDecls((declaration: Declaration) => {
        baseProps.add(declaration.prop);
      });

      for (const prop of CARD_CHROME) {
        expect(
          cardProps.has(prop),
          `${file}: .${base}--card must declare ${prop}`,
        ).toBe(true);
        expect(
          baseProps.has(prop),
          `${file}: .${base} must not declare ${prop}; plain would keep card chrome`,
        ).toBe(false);
      }
    }
  });
});

describe("app update notice theme contract", () => {
  const FILE = "components/AppUpdateNotice.vue";
  const INTERNAL_TOKENS = [
    ["text", "--color-text"],
    ["surface", "--color-surface-raised"],
    ["border", "--color-border"],
    ["primary", "--color-primary"],
    ["on-primary", "--color-on-primary"],
  ] as const;

  it("falls back to light-dark() values for token-less hosts", () => {
    const css = styleBlockOf(FILE);
    expect(css).toMatch(/@supports \(color: light-dark\(#000, #fff\)\)/);

    for (const [name, host] of INTERNAL_TOKENS) {
      const mapping = new RegExp(
        `--app-update-notice-${name}:\\s*var\\(\\s*${host}\\s*,\\s*light-dark\\([^()]*\\)\\s*\\)`,
      );
      expect(
        css,
        `${FILE} must map ${host} to --app-update-notice-${name} with a light-dark() fallback`,
      ).toMatch(mapping);
    }
  });

  it("consumes only documented host tokens and declares them in tokens.css", () => {
    const tokensCss = readFileSync(
      resolve(SOURCE_ROOT, "assets/css/tokens.css"),
      "utf8",
    );
    const declared = declaredProperties(tokensCss);

    for (const [, token] of styleBlockOf(FILE).matchAll(
      /var\(\s*--(color-[\w-]+)/g,
    )) {
      expect(
        HOST_TOKENS.has(token!),
        `${FILE} references the undocumented host token --${token}`,
      ).toBe(true);
      expect(
        declared.has(`--${token}`),
        `${FILE} references --${token}, which assets/css/tokens.css does not define`,
      ).toBe(true);
    }
  });

  it("declares every internal token it consumes", () => {
    const css = styleBlockOf(FILE);
    const declared = declaredProperties(css);

    for (const [, token] of css.matchAll(
      /var\(\s*--(app-update-notice-[\w-]+)/g,
    )) {
      expect(
        declared.has(`--${token}`),
        `${FILE} consumes --${token} without declaring it`,
      ).toBe(true);
    }
  });

  it("uses no raw colour literals in colour declarations", () => {
    parseStyle(FILE).walkDecls((declaration: Declaration) => {
      if (declaration.prop.startsWith("--")) return;
      if (!COLOUR_PROPERTIES.has(declaration.prop)) return;
      const literal = rawColour(declaration.value);
      expect(
        literal,
        `${FILE}: "${declaration.prop}: ${declaration.value}" uses the raw colour "${literal}"`,
      ).toBeNull();
    });
  });
});

describe("alert messages theme contract", () => {
  const FILE = "components/AlertMessages.vue";
  const INTERNAL_TOKENS = [
    ["success", "--color-success"],
    ["on-success", "--color-on-success"],
    ["warning", "--color-warning"],
    ["on-warning", "--color-on-warning"],
    ["error", "--color-error"],
    ["on-error", "--color-on-error"],
  ] as const;

  it("falls back to light-dark() values for token-less hosts", () => {
    const css = styleBlockOf(FILE);
    expect(css).toMatch(/@supports \(color: light-dark\(#000, #fff\)\)/);

    for (const [name, host] of INTERNAL_TOKENS) {
      const mapping = new RegExp(
        `--alert-message-${name}:\\s*var\\(\\s*${host}\\s*,\\s*light-dark\\([^()]*\\)\\s*\\)`,
      );
      expect(
        css,
        `${FILE} must map ${host} to --alert-message-${name} with a light-dark() fallback`,
      ).toMatch(mapping);
    }
  });

  it("consumes only documented host tokens and declares them in tokens.css", () => {
    const tokensCss = readFileSync(
      resolve(SOURCE_ROOT, "assets/css/tokens.css"),
      "utf8",
    );
    const declared = declaredProperties(tokensCss);

    for (const [, token] of styleBlockOf(FILE).matchAll(
      /var\(\s*--(color-[\w-]+)/g,
    )) {
      expect(
        HOST_TOKENS.has(token!),
        `${FILE} references the undocumented host token --${token}`,
      ).toBe(true);
      expect(
        declared.has(`--${token}`),
        `${FILE} references --${token}, which assets/css/tokens.css does not define`,
      ).toBe(true);
    }
  });

  it("declares every internal token it consumes", () => {
    const css = styleBlockOf(FILE);
    const declared = declaredProperties(css);

    for (const [, token] of css.matchAll(/var\(\s*--(alert-message-[\w-]+)/g)) {
      expect(
        declared.has(`--${token}`),
        `${FILE} consumes --${token} without declaring it`,
      ).toBe(true);
    }
  });
});

describe("offline banner theme contract", () => {
  const FILE = "components/OfflineBanner.vue";
  const INTERNAL_TOKENS = [
    ["text", "--color-on-warning"],
    ["surface", "--color-warning"],
  ] as const;

  it("falls back to light-dark() values for token-less hosts", () => {
    const css = styleBlockOf(FILE);
    expect(css).toMatch(/@supports \(color: light-dark\(#000, #fff\)\)/);

    for (const [name, host] of INTERNAL_TOKENS) {
      const mapping = new RegExp(
        `--offline-banner-${name}:\\s*var\\(\\s*${host}\\s*,\\s*light-dark\\([^()]*\\)\\s*\\)`,
      );
      expect(
        css,
        `${FILE} must map ${host} to --offline-banner-${name} with a light-dark() fallback`,
      ).toMatch(mapping);
    }
  });

  it("consumes only documented host tokens and declares them in tokens.css", () => {
    const tokensCss = readFileSync(
      resolve(SOURCE_ROOT, "assets/css/tokens.css"),
      "utf8",
    );
    const declared = declaredProperties(tokensCss);

    for (const [, token] of styleBlockOf(FILE).matchAll(
      /var\(\s*--(color-[\w-]+)/g,
    )) {
      expect(
        HOST_TOKENS.has(token!),
        `${FILE} references the undocumented host token --${token}`,
      ).toBe(true);
      expect(
        declared.has(`--${token}`),
        `${FILE} references --${token}, which assets/css/tokens.css does not define`,
      ).toBe(true);
    }
  });

  it("declares every internal token it consumes", () => {
    const css = styleBlockOf(FILE);
    const declared = declaredProperties(css);

    for (const [, token] of css.matchAll(/var\(\s*--(offline-banner-[\w-]+)/g)) {
      expect(
        declared.has(`--${token}`),
        `${FILE} consumes --${token} without declaring it`,
      ).toBe(true);
    }
  });
});
