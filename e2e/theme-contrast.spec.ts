import { expect, test } from "@playwright/test";
import { HOST_MODES } from "./palettes";
import { SCENARIOS } from "./scenarios";
import {
  expectPair,
  expectPartialDarkRegressionGuards,
  expectPlainCard,
  expectTokenEquals,
  openMode,
  prepareScenario,
  readColorScheme,
  readFixtureTokens,
} from "./harness";

/**
 * Real-browser WCAG 2.2 AA contrast harness for the login-with-code components.
 *
 * Every host mode runs the same scenarios: the three components are rendered
 * in a non-layer Vite host with Planner's partial dark/light palettes and with
 * no palette at all, and inside the Nuxt layer (light and dark), then the
 * computed colours are measured in Chromium. jsdom resolves neither the CSS
 * cascade nor `var()`, so the existing axe run disables `color-contrast`; this
 * suite is the guard that closes that gap.
 */
for (const mode of HOST_MODES) {
  test.describe(`host mode ${mode.id}`, () => {
    test.use({ colorScheme: mode.colorScheme });

    test("exposes the documented host palette", async ({ page }) => {
      await openMode(page, mode);
      const names = Object.keys(mode.fixtureTokens);

      if (names.length === 0) {
        const tokens = await readFixtureTokens(page, [
          "--color-text",
          "--space-md",
        ]);
        expect(
          tokens["--color-text"],
          `${mode.id}: a token-less host must not expose --color-text`,
        ).toBe("");
        expect(
          tokens["--space-md"],
          `${mode.id}: a token-less host must not expose --space-md`,
        ).toBe("");
      } else {
        const tokens = await readFixtureTokens(page, names);
        for (const [name, expected] of Object.entries(mode.fixtureTokens)) {
          expectTokenEquals(
            tokens[name],
            expected,
            `${mode.id}: the page should expose ${name} = ${expected}`,
          );
        }
      }

      expect(
        await readColorScheme(page),
        `${mode.id}: the page should resolve color-scheme: ${mode.colorScheme}`,
      ).toBe(mode.colorScheme);
    });

    for (const scenario of SCENARIOS) {
      test(`${scenario.id} meets WCAG AA`, async ({ page }) => {
        await openMode(page, mode);
        await prepareScenario(page, scenario);

        for (const pair of scenario.pairs) {
          await expectPair(page, mode, scenario, pair);
        }

        if (scenario.plain) await expectPlainCard(page);

        if (mode.id === "partial-dark" && scenario.id === "login-waiting") {
          await expectPartialDarkRegressionGuards(page, mode);
        }
      });
    }
  });
}
