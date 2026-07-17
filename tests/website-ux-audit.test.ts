import { describe, expect, it } from "vitest";
import {
  buildModelPrompt,
  deduplicateFindings,
  extractJsonObject,
  isAddressBlocked,
  parseArgs,
  validateAiAudit,
  validateTarget,
  type ElementEvidence,
  type Finding,
} from "../skills/website-ux-audit/scripts/core.ts";
import { runAudit } from "../skills/website-ux-audit/scripts/audit.ts";
import { buildMarkdownReport } from "../skills/website-ux-audit/scripts/markdown.ts";
import {
  buildSidecar,
  isSidecar,
} from "../skills/website-ux-audit/scripts/sidecar.ts";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const element: ElementEvidence = {
  id: "desktop-1",
  tag: "button",
  role: "button",
  text: "Save",
  accessibleName: "Save",
  href: null,
  alt: null,
  inputType: null,
  rect: { x: 10, y: 20, width: 80, height: 40 },
  styles: {
    display: "block",
    position: "static",
    fontSize: "16px",
    fontWeight: "400",
    color: "rgb(0, 0, 0)",
    backgroundColor: "rgb(255, 255, 255)",
    textAlign: "center",
    overflow: "visible",
  },
};

const deterministicFinding: Finding = {
  id: "f1",
  source: "scripted-check",
  viewport: "mobile",
  severity: "high",
  category: "responsive-layout",
  heuristic: null,
  title: "Page overflows the viewport horizontally",
  observation: "Body overflows innerWidth by 38 CSS px.",
  userImpact: "Sideways scrolling is required on small screens.",
  recommendation: "Constrain the overflowing element.",
  confidence: 0.98,
  elementId: "desktop-1",
  criterion: "WCAG 1.4.10",
  requiresManualVerification: true,
  anchor: { x: 200, y: 100 },
};

const modelFinding: Finding = {
  id: "f2",
  source: "ai",
  viewport: "both",
  severity: "medium",
  category: "accessibility",
  heuristic: "recognition-rather-than-recall",
  title: "No skip-to-content link",
  observation: "No skip-to-content link was found in the header.",
  userImpact:
    "Keyboard users must tab through navigation to reach the main content.",
  recommendation: "Add a visible-on-focus skip link.",
  confidence: 0.92,
  elementId: null,
  criterion: "WCAG 2.4.1",
  requiresManualVerification: false,
  anchor: null,
};

const sampleCaptures = [
  {
    viewport: {
      id: "desktop" as const,
      label: "Desktop 1440 x 1024",
      width: 1440,
      height: 1024,
      isMobile: false,
      hasTouch: false,
    },
    finalUrl: "https://example.com/",
    title: "Example Domain",
    screenshotFile: "/out/desktop.png",
    screenshotWidth: 1440,
    screenshotHeight: 1024,
    pageWidth: 1478,
    pageHeight: 1500,
    elements: [element],
    findings: [deterministicFinding],
    evidenceFiles: ["/out/evidence/desktop-detail-1.png"],
  },
  {
    viewport: {
      id: "mobile" as const,
      label: "Mobile 390 x 844",
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    },
    finalUrl: "https://example.com/",
    title: "Example Domain",
    screenshotFile: "/out/mobile.png",
    screenshotWidth: 390,
    screenshotHeight: 844,
    pageWidth: 390,
    pageHeight: 1500,
    elements: [element],
    findings: [deterministicFinding],
    evidenceFiles: [],
  },
];

const sampleInputs = {
  url: "https://example.com/",
  title: "Example Domain",
  generatedAt: "2026-07-12T00:00:00.000Z",
  model: "openai-codex/gpt-5.4-mini",
  context: null,
  captures: sampleCaptures,
  findings: [deterministicFinding, modelFinding],
  executiveSummary:
    "The page is functional but has responsive and accessibility issues that warrant follow-up.",
};

describe("website UX audit core", () => {
  it("parses the supported CLI contract and bounds integers", () => {
    expect(
      parseArgs(["--url", "https://example.com", "--max-findings", "12"])
        .maxFindings,
    ).toBe(12);
    expect(() =>
      parseArgs(["--url", "https://example.com", "--max-findings", "41"]),
    ).toThrow("1 to 40");
    expect(() => parseArgs(["--url", "file:///tmp/page.html"])).toThrow(
      "http or https",
    );
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "224.0.0.1",
  ])("blocks non-public address %s", (address) => {
    expect(isAddressBlocked(address)).toBe(true);
  });

  it("allows public addresses and blocks credential-bearing targets", () => {
    expect(isAddressBlocked("93.184.216.34")).toBe(false);
    expect(() =>
      validateTarget("http://user:secret@example.com", [], false),
    ).toThrow("credentials");
    expect(() =>
      validateTarget("https://example.com", ["169.254.169.254"], true),
    ).toThrow("metadata");
    expect(() =>
      validateTarget("https://example.com", ["10.0.0.1"], false),
    ).toThrow("private");
    expect(
      validateTarget("https://example.com", ["10.0.0.1"], true).hostname,
    ).toBe("example.com");
  });

  it("extracts fenced JSON and validates grounded model findings", () => {
    const raw = `\n\`\`\`json\n${JSON.stringify({ executiveSummary: "The page has a clear structure but weak save feedback.", findings: [modelFinding] })}\n\`\`\``;
    const parsed = validateAiAudit(extractJsonObject(raw), new Map(), 18);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]?.title).toBe("No skip-to-content link");
  });

  it("rejects unknown evidence references and unsupported coverage claims", () => {
    expect(() =>
      validateAiAudit(
        {
          executiveSummary:
            "A sufficiently detailed audit summary for validation.",
          findings: [{ ...modelFinding, elementId: "missing" }],
        },
        new Map([["desktop-1", { viewport: "desktop", element }]]),
        18,
      ),
    ).toThrow("unknown element");
    expect(() =>
      validateAiAudit(
        {
          executiveSummary:
            "This covers 35% of WCAG criteria in this automated audit.",
          findings: [],
        },
        new Map(),
        18,
      ),
    ).toThrow("coverage percentage");
  });

  it("deduplicates findings", () => {
    expect(
      deduplicateFindings([modelFinding, { ...modelFinding, id: "f2b" }]),
    ).toHaveLength(1);
  });

  it("builds a prompt with all ten heuristics and strict claims boundaries", () => {
    const prompt = buildModelPrompt(
      { url: "https://example.com", context: "", maxFindings: 18 },
      [],
    );
    expect(prompt).toContain("1. Visibility of system status");
    expect(prompt).toContain("10. Help and documentation");
    expect(prompt).toContain("Do not claim WCAG conformance");
    expect(prompt).toContain("Do not infer conversion impact");
  });
});

describe("markdown report", () => {
  it("contains all required sections, claim-blocker, and limitation list", () => {
    const md = buildMarkdownReport(sampleInputs);
    expect(md).toMatch(/^# Website UX audit — /m);
    expect(md).toContain("## Summary");
    expect(md).toContain("## Evidence");
    expect(md).toContain("## Deterministic findings (1)");
    expect(md).toContain("## Model findings (1)");
    expect(md).toContain("## Claims boundary");
    expect(md).toContain("Not WCAG conformance certification");
    expect(md).toMatch(/2 total \(1 high, 1 medium, 0 low/);
  });

  it("rejects claim-boundary violations in the executive summary", () => {
    expect(() =>
      buildMarkdownReport({
        ...sampleInputs,
        executiveSummary: "WCAG certified pass rate 100% of WCAG criteria.",
      }),
    ).toThrow(/WCAG/);
  });

  it("rejects claim-boundary violations in finding text", () => {
    expect(() =>
      buildMarkdownReport({
        ...sampleInputs,
        findings: [
          {
            ...modelFinding,
            observation: "The page passes WCAG 2.1 AA on the audited subset.",
          },
        ],
      }),
    ).toThrow(/WCAG pass/);
  });

  it("rejects conversion-impact claims", () => {
    expect(() =>
      buildMarkdownReport({
        ...sampleInputs,
        findings: [
          { ...modelFinding, userImpact: "Predicts a conversion lift of 12%." },
        ],
      }),
    ).toThrow(/conversion/);
  });

  it("preserves pipe characters in finding text without breaking markdown", () => {
    const md = buildMarkdownReport({
      ...sampleInputs,
      findings: [
        {
          ...modelFinding,
          title: "Pipe | in title",
          observation: "Backslash \\ in observation.",
          userImpact: "Impact",
          recommendation: "Reco",
        },
      ],
    });
    expect(md).toContain("Pipe | in title");
    expect(md).toContain("Backslash \\ in observation");
  });

  it("renders the empty-findings fallback when no findings are produced", () => {
    const md = buildMarkdownReport({ ...sampleInputs, findings: [] });
    expect(md).toContain("No findings were produced in this first pass.");
  });
});

describe("json sidecar", () => {
  it("contains counts, paths, model, and limitations but not findings", () => {
    const sidecar = buildSidecar({
      url: "https://example.com/",
      generatedAt: "2026-07-12T00:00:00.000Z",
      outputDir: "/out",
      model: "openai-codex/gpt-5.4-mini",
      findings: [deterministicFinding, modelFinding],
    });
    expect(sidecar.counts).toEqual({
      total: 2,
      high: 1,
      medium: 1,
      low: 0,
      automated: 1,
      model: 1,
    });
    expect(sidecar.screenshots.desktop).toBe("/out/desktop.png");
    expect(sidecar.screenshots.mobile).toBe("/out/mobile.png");
    expect(sidecar.evidenceDirectory).toBe("/out/evidence");
    expect(sidecar.limitations.length).toBeGreaterThan(0);
    expect(isSidecar(sidecar)).toBe(true);
    expect(Object.keys(sidecar)).not.toContain("findings");
  });

  it("rejects payloads that include findings", () => {
    const bad = {
      ...buildSidecar({
        url: "u",
        generatedAt: "t",
        outputDir: "o",
        model: "m",
        findings: [],
      }),
      findings: [],
    };
    expect(isSidecar(bad)).toBe(false);
  });
});

describe("audit orchestration", () => {
  it("removes temporary output when model review fails", async () => {
    const parent = await mkdtemp(join(tmpdir(), "uxa-atomic-"));
    const out = join(parent, "final");
    try {
      await expect(
        runAudit(
          {
            url: "https://example.com/",
            out,
            context: "",
            maxFindings: 18,
            timeout: 5000,
            waitMs: 0,
            allowPrivate: false,
            help: false,
          },
          {
            launchBrowser: async () =>
              ({ close: async () => undefined }) as never,
            capture: async (_browser, captureOptions, viewport) => ({
              viewport,
              finalUrl: captureOptions.url,
              title: "Fixture",
              screenshotFile: join(captureOptions.out, `${viewport.id}.png`),
              screenshotWidth: viewport.width,
              screenshotHeight: viewport.height,
              pageWidth: viewport.width,
              pageHeight: viewport.height,
              elements: [],
              findings: [],
              evidenceFiles: [],
            }),
            reviewer: {
              review: async () => {
                throw new Error("provider unavailable");
              },
            },
          },
        ),
      ).rejects.toThrow("model review failed");
      expect(existsSync(out)).toBe(false);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
