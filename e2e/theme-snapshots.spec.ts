import { expect, test } from "@playwright/test";
import { HOST_MODES } from "./palettes";
import { SCENARIOS } from "./scenarios";
import { openMode, prepareScenario, scenarioSection } from "./harness";

/**
 * One element screenshot per scenario and host mode. The baseline is
 * Linux/Chromium with the DejaVu font set only; regenerate with
 * `npm run test:e2e -- --update-snapshots` on Linux after an intentional
 * visual change.
 */
for (const mode of HOST_MODES) {
  test.describe(`snapshots ${mode.id}`, () => {
    test.use({ colorScheme: mode.colorScheme });

    for (const scenario of SCENARIOS) {
      test(`${scenario.id} looks stable`, async ({ page }) => {
        await openMode(page, mode);
        await prepareScenario(page, scenario);
        await expect(scenarioSection(page, scenario)).toHaveScreenshot(
          `${mode.id}-${scenario.id}.png`,
        );
      });
    }
  });
}
