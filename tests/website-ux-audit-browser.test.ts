import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { captureViewport } from "../skills/website-ux-audit/scripts/browser.ts";
import { VIEWPORTS } from "../skills/website-ux-audit/scripts/core.ts";

let origin = "";
let closeServer: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main style="width: 500px"><a href="#">Learn more</a><a href="#two">Learn more</a><button style="width: 18px;height:18px">?</button></main></body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture server did not bind.");
  origin = `http://127.0.0.1:${address.port}`;
  closeServer = async () =>
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

afterAll(async () => {
  await closeServer?.();
});

describe("website UX audit browser capture", () => {
  it("rejects a local target by default", async () => {
    const browser = await chromium.launch({ headless: true });
    const out = await mkdtemp(join(tmpdir(), "uxa-browser-"));
    try {
      await expect(
        captureViewport(
          browser,
          {
            url: origin,
            out,
            context: "",
            maxFindings: 18,
            timeout: 10000,
            waitMs: 0,
            allowPrivate: false,
            help: false,
          },
          VIEWPORTS[1]!,
        ),
      ).rejects.toThrow("private");
    } finally {
      await browser.close();
      await rm(out, { recursive: true, force: true });
    }
  });

  it("captures an authorised local fixture and returns axe/script evidence", async () => {
    const browser = await chromium.launch({ headless: true });
    const out = await mkdtemp(join(tmpdir(), "uxa-browser-"));
    try {
      const result = await captureViewport(
        browser,
        {
          url: origin,
          out,
          context: "",
          maxFindings: 18,
          timeout: 10000,
          waitMs: 0,
          allowPrivate: true,
          help: false,
        },
        VIEWPORTS[1]!,
      );
      expect(result.screenshotWidth).toBeGreaterThanOrEqual(390);
      expect(result.pageWidth).toBeGreaterThan(result.viewport.width);
      expect(result.elements.length).toBeGreaterThan(0);
      expect(
        result.findings.some((item) => item.title === "Page title is missing"),
      ).toBe(true);
      expect(
        result.findings.some(
          (item) => item.title === "Document language is not declared",
        ),
      ).toBe(true);
      expect(result.findings.some((item) => item.source === "axe-core")).toBe(
        true,
      );
      expect(result.evidenceFiles.length).toBeGreaterThan(0);
    } finally {
      await browser.close();
      await rm(out, { recursive: true, force: true });
    }
  }, 30000);
});
