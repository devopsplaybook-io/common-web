import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packedDirectory = process.env.COMMON_WEB_PACKED_DIR;

describe("app-shell hooks", () => {
  it("runs against the packed app-shell.css", () => {
    expect(
      packedDirectory,
      "COMMON_WEB_PACKED_DIR is not set; run the tests through `npm test` so the packed package is verified",
    ).toBeDefined();
  });

  it("ships the class hooks alongside the legacy ID anchors", () => {
    const css = readFileSync(
      resolve(packedDirectory!, "assets/css/app-shell.css"),
      "utf8",
    );

    expect(css).toMatch(/\.page-layout\b/);
    expect(css).toMatch(/#page-layout\b/);
    expect(css).toMatch(/\.page-alert-messages\b/);
    expect(css).toMatch(/#page-alert-messages\b/);
  });
});
