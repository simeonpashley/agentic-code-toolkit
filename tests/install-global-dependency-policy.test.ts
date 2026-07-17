import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

describe("global installer dependency policy", () => {
  it("copies the pnpm workspace build allowlist before production install", () => {
    const installer = readFileSync(
      join(root, "scripts/install-global.ts"),
      "utf8",
    );
    const destinationConfig = JSON.parse(
      readFileSync(join(root, "scripts/install-dest-config.json"), "utf8"),
    ) as { blocklist: string[] };
    expect(installer).toContain('join(KIT, "pnpm-workspace.yaml")');
    expect(installer).toContain('join(PI_AGENT, "pnpm-workspace.yaml")');
    expect(destinationConfig.blocklist).not.toContain("pnpm-workspace.yaml");
  });
});
