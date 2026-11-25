import { expect, type Locator, type Page } from "@playwright/test";
import {
  composite,
  compositeChain,
  contrastRatio,
  formatColor,
  parseColor,
  relativeLuminance,
  sameColor,
  type Rgba,
} from "./contrast";
import { AA_MINIMUM, type HostMode } from "./palettes";
import { SCENARIOS, type ContrastPair, type Scenario } from "./scenarios";

export interface Measurement {
  foreground: Rgba;
  background: Rgba;
  ratio: number;
}

export function scenarioSection(page: Page, scenario: Scenario): Locator {
  return page.locator(`[data-scenario="${scenario.id}"]`);
}

function scenarioById(id: string): Scenario {
  const scenario = SCENARIOS.find((entry) => entry.id === id);
  if (!scenario) throw new Error(`Unknown scenario "${id}"`);
  return scenario;
}

function pairById(scenario: Scenario, id: string): ContrastPair {
  const pair = scenario.pairs.find((entry) => entry.id === id);
  if (!pair) throw new Error(`Scenario "${scenario.id}" has no pair "${id}"`);
  return pair;
}

/** Navigate to the host page, applying the layer theme before the app loads. */
export async function openMode(page: Page, mode: HostMode): Promise<void> {
  if (mode.layerTheme) {
    const theme = mode.layerTheme;
    // The layer's pre-paint script reads `UI_THEME` and `prefers-color-scheme`.
    await page.addInitScript((value: string) => {
      try {
        window.localStorage.setItem("UI_THEME", value);
      } catch {
        /* storage blocked: the emulated colorScheme still applies */
      }
    }, theme);
  }
  await page.goto(mode.url, { waitUntil: "domcontentloaded" });
  if (mode.layerTheme) {
    await expect(
      page.locator("html"),
      `${mode.id}: the pre-paint theme script should set data-theme`,
    ).toHaveAttribute("data-theme", mode.layerTheme);
  }
  await expect(
    page.locator("[data-scenario]"),
    `${mode.id}: the host page should render every scenario`,
  ).toHaveCount(SCENARIOS.length);
}

/** Act out the scenario (if needed) and wait until its state has rendered. */
export async function prepareScenario(
  page: Page,
  scenario: Scenario,
): Promise<Locator> {
  const section = scenarioSection(page, scenario);
  if (scenario.action) await scenario.action(page);
  await expect(
    section.locator(scenario.ready),
    `${scenario.id}: waiting for "${scenario.ready}"`,
  ).toBeVisible();
  return section;
}

/**
 * Read the foreground colour and the background stack in the page, resolve the
 * cascade (including `var()`, `light-dark()` and `color-mix()`) with real
 * `getComputedStyle`, then compute the WCAG ratio in Node.
 */
export async function measurePair(
  page: Page,
  scenario: Scenario,
  pair: ContrastPair,
): Promise<Measurement> {
  const section = scenarioSection(page, scenario);
  const raw = await section.evaluate(
    (root, spec) => {
      const foreground = root.querySelector(spec.fg);
      if (!foreground) return { color: null, chain: [] as string[] };
      const background =
        spec.bg === "self"
          ? foreground
          : spec.bg
            ? root.querySelector(spec.bg)
            : null;
      const chain: string[] = [];
      let node: Element | null = background ?? foreground;
      while (node) {
        chain.push(getComputedStyle(node).backgroundColor);
        node = node.parentElement;
      }
      return { color: getComputedStyle(foreground).color, chain };
    },
    { fg: pair.fg, bg: pair.bg },
  );

  if (!raw.color) {
    throw new Error(
      `${scenario.id}: foreground selector "${pair.fg}" was not found`,
    );
  }

  const background = compositeChain(raw.chain);
  const foreground = composite(parseColor(raw.color), background);
  return {
    foreground,
    background,
    ratio: contrastRatio(foreground, background),
  };
}

/** Assert the pair clears its minimum and renders the documented host token. */
export async function expectPair(
  page: Page,
  mode: HostMode,
  scenario: Scenario,
  pair: ContrastPair,
): Promise<Measurement> {
  const measurement = await measurePair(page, scenario, pair);
  const minimum = mode.minimums?.[pair.id] ?? AA_MINIMUM;

  expect
    .soft(
      measurement.ratio,
      `${mode.id} ${scenario.id} ${pair.label}: ${formatColor(
        measurement.foreground,
      )} on ${formatColor(measurement.background)} is ${measurement.ratio.toFixed(
        2,
      )}:1, below the ${minimum}:1 minimum`,
    )
    .toBeGreaterThanOrEqual(minimum);

  const expected = mode.expected[pair.token];
  expect
    .soft(
      sameColor(measurement.foreground, parseColor(expected)),
      `${mode.id} ${scenario.id} ${pair.label}: ${formatColor(
        measurement.foreground,
      )} does not match the host ${pair.token} token (${expected})`,
    )
    .toBe(true);

  return measurement;
}

/** `variant="plain"` must not paint the card chrome or add outer padding. */
export async function expectPlainCard(page: Page): Promise<void> {
  const card = page.locator(
    '[data-scenario="login-plain"] .login-with-code-card',
  );
  await expect(card).toHaveCount(1);
  const styles = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
    };
  });

  expect
    .soft(
      styles.backgroundColor,
      "variant=plain must not paint a card background",
    )
    .toBe("rgba(0, 0, 0, 0)");
  expect
    .soft(styles.boxShadow, "variant=plain must not paint a card shadow")
    .toBe("none");
  for (const side of [
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
  ] as const) {
    expect
      .soft(styles[side], `variant=plain must not paint a ${side}`)
      .toBe("0px");
  }
  for (const side of [
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
  ] as const) {
    expect
      .soft(styles[side], `variant=plain must not add ${side}`)
      .toBe("0px");
  }
}

/**
 * The reported regression, expressed as assertions: in Planner's dark palette
 * the code panel must be dark, the code must use the host text colour, and the
 * primary button label must use the host `--color-on-primary`, never `#fff`.
 */
export async function expectPartialDarkRegressionGuards(
  page: Page,
  mode: HostMode,
): Promise<void> {
  const waiting = scenarioById("login-waiting");
  const code = await measurePair(page, waiting, pairById(waiting, "code"));
  const panelLuminance = relativeLuminance(code.background);
  expect
    .soft(
      panelLuminance,
      `partial-dark login-waiting code panel background ${formatColor(
        code.background,
      )} has relative luminance ${panelLuminance.toFixed(3)}, not a dark surface (< 0.1)`,
    )
    .toBeLessThan(0.1);
  const expectedText = parseColor(mode.expected.text);
  expect
    .soft(
      sameColor(code.foreground, expectedText),
      `partial-dark login-waiting code text ${formatColor(
        code.foreground,
      )} does not match the host --color-text (${mode.expected.text})`,
    )
    .toBe(true);
  expect
    .soft(
      sameColor(code.foreground, parseColor("#171717")),
      "partial-dark login-waiting code text must not be the light-theme #171717",
    )
    .toBe(false);

  const error = scenarioById("login-error");
  const primary = await measurePair(page, error, pairById(error, "primary"));
  expect
    .soft(
      sameColor(primary.foreground, parseColor(mode.expected.onPrimary)),
      `partial-dark login-error primary label ${formatColor(
        primary.foreground,
      )} does not match the host --color-on-primary (${mode.expected.onPrimary})`,
    )
    .toBe(true);
  expect
    .soft(
      sameColor(primary.foreground, parseColor("#ffffff")),
      "partial-dark login-error primary label must not be #fff",
    )
    .toBe(false);
}

/** Read the CSS custom properties the fixture claims to expose. */
export async function readFixtureTokens(
  page: Page,
  names: readonly string[],
): Promise<Record<string, string>> {
  return page.evaluate((list) => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      list.map((name) => [name, style.getPropertyValue(name).trim()]),
    );
  }, [...names]);
}

/**
 * Assert a custom property equals its documented value. Colours are compared
 * by value (`#fff` and `#ffffff` are the same colour); non-colour tokens such
 * as `--space-md: 1em` fall back to a case-insensitive string comparison.
 */
export function expectTokenEquals(
  actual: string | undefined,
  expected: string,
  message: string,
): void {
  expect(actual, message).toBeDefined();
  let matches: boolean;
  try {
    matches = sameColor(parseColor(actual ?? ""), parseColor(expected));
  } catch {
    matches = (actual ?? "").toLowerCase() === expected.toLowerCase();
  }
  expect(
    matches,
    `${message} (received ${JSON.stringify(actual)})`,
  ).toBe(true);
}

/** Effective `color-scheme` used by the page (drives `light-dark()`). */
export async function readColorScheme(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
}
