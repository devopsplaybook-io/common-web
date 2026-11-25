import type { Page } from "@playwright/test";
import type { ExpectedKey } from "./palettes";

export interface ContrastPair {
  /** Stable id, also used for per-mode minimum overrides. */
  id: string;
  /** Human-readable label for failure messages. */
  label: string;
  /** Foreground selector, scoped to the scenario section. */
  fg: string;
  /** Background selector; `"self"` reads the foreground element's own
   * background, `null` composites the ancestor stack. */
  bg: "self" | string | null;
  /** Host token the foreground must equal. */
  token: ExpectedKey;
}

export interface Scenario {
  /** Matches the `data-scenario` attribute in both host pages. */
  id: string;
  /** Selector that proves the state under test has rendered. */
  ready: string;
  /** Optional interaction that moves the component into the state. */
  action?: (page: Page) => Promise<void>;
  pairs: ContrastPair[];
  /** Renders `variant="plain"`; asserts the embedded card has no chrome. */
  plain?: boolean;
}

function submitCode(scenarioId: string): (page: Page) => Promise<void> {
  return async (page: Page): Promise<void> => {
    const section = page.locator(`[data-scenario="${scenarioId}"]`);
    await section.locator(".login-code-input-field").fill("BCDFGHJK");
    await section
      .locator(".authorize-device-form .authorize-device-button-primary")
      .click();
  };
}

const WARNING_PAIR: ContrastPair = {
  id: "warning",
  label: "warning callout text",
  fg: ".authorize-device-warning",
  bg: "self",
  token: "text",
};

const INPUT_PAIR: ContrastPair = {
  id: "input",
  label: "input text",
  fg: ".login-code-input-field",
  bg: "self",
  token: "text",
};

const INPUT_LABEL_PAIR: ContrastPair = {
  id: "input-label",
  label: "input label",
  fg: ".login-code-input-label",
  bg: null,
  token: "text",
};

const CODE_PAIR: ContrastPair = {
  id: "code",
  label: "code text",
  fg: ".login-with-code-value",
  bg: ".login-with-code-display",
  token: "text",
};

const LOGIN_MUTED_PAIR: ContrastPair = {
  id: "muted-label",
  label: "muted label",
  fg: ".login-with-code-label",
  bg: ".login-with-code-display",
  token: "muted",
};

export const SCENARIOS: Scenario[] = [
  {
    id: "login-waiting",
    ready: ".login-with-code-value",
    pairs: [
      CODE_PAIR,
      LOGIN_MUTED_PAIR,
      {
        id: "secondary",
        label: "secondary button label",
        fg: ".login-with-code-button-secondary",
        bg: null,
        token: "text",
      },
    ],
  },
  {
    id: "login-plain",
    ready: ".login-with-code-value",
    plain: true,
    pairs: [CODE_PAIR, LOGIN_MUTED_PAIR],
  },
  {
    id: "login-error",
    ready: ".login-with-code-button-primary",
    pairs: [
      {
        id: "status",
        label: "status text",
        fg: ".login-with-code-status",
        bg: null,
        token: "text",
      },
      {
        id: "primary",
        label: "primary button label",
        fg: ".login-with-code-button-primary",
        bg: "self",
        token: "onPrimary",
      },
    ],
  },
  {
    id: "authorize-entry",
    ready: ".authorize-device-form .authorize-device-button-primary:enabled",
    pairs: [
      WARNING_PAIR,
      INPUT_PAIR,
      INPUT_LABEL_PAIR,
      {
        id: "primary",
        label: "primary button label",
        fg: ".authorize-device-form .authorize-device-button-primary",
        bg: "self",
        token: "onPrimary",
      },
    ],
  },
  {
    id: "authorize-preview",
    ready: ".authorize-device-preview",
    action: submitCode("authorize-preview"),
    pairs: [
      WARNING_PAIR,
      INPUT_PAIR,
      INPUT_LABEL_PAIR,
      {
        id: "preview-label",
        label: "preview label",
        fg: ".authorize-device-details dt",
        bg: ".authorize-device-preview",
        token: "muted",
      },
      {
        id: "primary",
        label: "primary button label",
        fg: ".authorize-device-actions .authorize-device-button-primary",
        bg: "self",
        token: "onPrimary",
      },
      {
        id: "secondary",
        label: "secondary button label",
        fg: ".authorize-device-actions .authorize-device-button-secondary",
        bg: null,
        token: "text",
      },
    ],
  },
  {
    id: "authorize-error",
    ready: ".authorize-device-error",
    action: submitCode("authorize-error"),
    pairs: [
      WARNING_PAIR,
      INPUT_PAIR,
      INPUT_LABEL_PAIR,
      {
        id: "error",
        label: "error text",
        fg: ".authorize-device-error",
        bg: null,
        token: "danger",
      },
      {
        id: "primary",
        label: "primary button label",
        fg: ".authorize-device-form .authorize-device-button-primary",
        bg: "self",
        token: "onPrimary",
      },
    ],
  },
  {
    id: "input-normal",
    ready: ".login-code-input-field",
    pairs: [INPUT_PAIR, INPUT_LABEL_PAIR],
  },
  {
    id: "input-error",
    ready: ".login-code-input-error",
    pairs: [
      INPUT_PAIR,
      INPUT_LABEL_PAIR,
      {
        id: "error",
        label: "input error text",
        fg: ".login-code-input-error",
        bg: null,
        token: "danger",
      },
    ],
  },
];
