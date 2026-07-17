import { describe, it, expect } from "vitest";
import {
  extractJsonLd,
  extractMicrodata,
  extractRdfa,
  getTitle,
  getCanonical,
  getMetaContent,
  getMetaContents,
  getLang,
  getCharset,
  countHeadings,
  validateStructuredData,
  summarise,
  type Finding,
} from "./audit-url";

describe("getTitle", () => {
  it("extracts title", () => {
    expect(getTitle("<title>Hello</title>")).toBe("Hello");
  });
  it("handles whitespace and newlines", () => {
    expect(getTitle("<title>\n  Hello world  \n</title>")).toBe("Hello world");
  });
  it("returns null when missing", () => {
    expect(getTitle("<head></head>")).toBeNull();
  });
  it("decodes HTML entities", () => {
    expect(getTitle("<title>Tom &amp; Jerry</title>")).toBe("Tom & Jerry");
  });
});

describe("getCanonical", () => {
  it("extracts canonical URL", () => {
    expect(
      getCanonical('<link rel="canonical" href="https://example.com/page">'),
    ).toBe("https://example.com/page");
  });
  it("handles reversed attribute order", () => {
    expect(
      getCanonical('<link href="https://example.com/page" rel="canonical">'),
    ).toBe("https://example.com/page");
  });
  it("returns null when missing", () => {
    expect(getCanonical("<head></head>")).toBeNull();
  });
});

describe("getMetaContent / getMetaContents", () => {
  it("extracts a named meta tag", () => {
    expect(
      getMetaContent(
        '<meta name="description" content="A page">',
        "name",
        "description",
      ),
    ).toBe("A page");
  });
  it("extracts a property meta tag (OG)", () => {
    expect(
      getMetaContent(
        '<meta property="og:title" content="OG Title">',
        "property",
        "og:title",
      ),
    ).toBe("OG Title");
  });
  it("returns null when meta tag missing", () => {
    expect(getMetaContent("<head></head>", "name", "robots")).toBeNull();
  });
  it("extracts all meta tags with the given attribute", () => {
    const html = `
      <meta property="og:title" content="T">
      <meta property="og:description" content="D">
      <meta property="og:image" content="I">
    `;
    expect(getMetaContents(html, "property")).toEqual({
      "og:title": "T",
      "og:description": "D",
      "og:image": "I",
    });
  });
});

describe("getLang / getCharset", () => {
  it("extracts lang from html tag", () => {
    expect(getLang('<html lang="en">')).toBe("en");
  });
  it("extracts charset", () => {
    expect(getCharset('<meta charset="utf-8">')).toBe("utf-8");
  });
  it("returns null when missing", () => {
    expect(getLang("<html>")).toBeNull();
    expect(getCharset("<head></head>")).toBeNull();
  });
});

describe("countHeadings", () => {
  it("counts h1 and h2", () => {
    const html = "<h1>A</h1><h2>B</h2><h2>C</h2><h3>D</h3>";
    expect(countHeadings(html, "h1")).toBe(1);
    expect(countHeadings(html, "h2")).toBe(2);
  });
});

// ── Structured data extraction ────────────────────────────────────────

describe("extractJsonLd", () => {
  it("extracts a single JSON-LD block with @type", () => {
    const html = `<script type="application/ld+json">{"@type":"Article","headline":"X"}</script>`;
    const blocks = extractJsonLd(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.format).toBe("json-ld");
    expect(blocks[0]!.types).toEqual(["Article"]);
    expect(blocks[0]!.parseError).toBeUndefined();
  });

  it("extracts a top-level array", () => {
    const html = `<script type="application/ld+json">[{"@type":"Article"},{"@type":"BreadcrumbList"}]</script>`;
    const blocks = extractJsonLd(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.types).toEqual(["Article", "BreadcrumbList"]);
  });

  it("extracts a @graph array", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":"WebSite"}]}</script>`;
    const blocks = extractJsonLd(html);
    expect(blocks[0]!.types).toContain("Organization");
  });

  it("captures parse errors without crashing", () => {
    const html = `<script type="application/ld+json">{bad json</script>`;
    const blocks = extractJsonLd(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.parseError).toBeDefined();
  });

  it("returns empty when no JSON-LD present", () => {
    expect(extractJsonLd("<head></head>")).toEqual([]);
  });
});

describe("extractMicrodata", () => {
  it("extracts schema.org type from itemtype", () => {
    const html = `<div itemscope itemtype="https://schema.org/Product">`;
    const blocks = extractMicrodata(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.format).toBe("microdata");
    expect(blocks[0]!.types).toEqual(["Product"]);
  });

  it("returns empty when no microdata", () => {
    expect(extractMicrodata("<div></div>")).toEqual([]);
  });
});

describe("extractRdfa", () => {
  it("extracts typeof attribute", () => {
    const html = `<div typeof="schema:Article">`;
    const blocks = extractRdfa(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.format).toBe("rdfa");
    expect(blocks[0]!.types).toEqual(["schema:Article"]);
  });
});

// ── Validation ────────────────────────────────────────────────────────

describe("validateStructuredData", () => {
  it("flags missing required properties", () => {
    const html = `<script type="application/ld+json">{"@type":"Article"}</script>`;
    const blocks = validateStructuredData(extractJsonLd(html));
    expect(blocks[0]!.validationErrors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Article missing required property: headline"),
        expect.stringContaining("Article missing required property: author"),
        expect.stringContaining(
          "Article missing required property: datePublished",
        ),
      ]),
    );
  });

  it("passes when required properties present", () => {
    const html = `<script type="application/ld+json">{"@type":"Article","headline":"X","author":"A","datePublished":"2025-01-01"}</script>`;
    const blocks = validateStructuredData(extractJsonLd(html));
    expect(blocks[0]!.validationErrors).toEqual([]);
  });

  it("flags self-serving Review (author matches brand)", () => {
    const html = `<script type="application/ld+json">{
      "@type":"Review",
      "author":{"@type":"Person","name":"Acme"},
      "itemReviewed":{"@type":"Product","brand":{"name":"Acme"}},
      "reviewRating":{"ratingValue":5}
    }</script>`;
    const blocks = validateStructuredData(extractJsonLd(html));
    expect(blocks[0]!.validationErrors).toEqual(
      expect.arrayContaining([expect.stringContaining("self-serving Review")]),
    );
  });

  it("flags AggregateRating with single review", () => {
    const html = `<script type="application/ld+json">{
      "@type":"Product",
      "name":"X",
      "image":"i",
      "aggregateRating":{"ratingValue":5,"reviewCount":1}
    }</script>`;
    const blocks = validateStructuredData(extractJsonLd(html));
    expect(blocks[0]!.validationErrors).toEqual(
      expect.arrayContaining([expect.stringContaining("single-review")]),
    );
  });

  it("does not flag AggregateRating with multiple reviews", () => {
    const html = `<script type="application/ld+json">{
      "@type":"Product",
      "name":"X",
      "image":"i",
      "aggregateRating":{"ratingValue":4.5,"reviewCount":42}
    }</script>`;
    const blocks = validateStructuredData(extractJsonLd(html));
    expect(blocks[0]!.validationErrors).toEqual([]);
  });
});

// ── summarise ─────────────────────────────────────────────────────────

describe("summarise", () => {
  it("counts findings by severity", () => {
    const findings: Finding[] = [
      { category: "X", severity: "blocker", message: "b1" },
      { category: "X", severity: "blocker", message: "b2" },
      { category: "X", severity: "major", message: "m1" },
      { category: "X", severity: "minor", message: "n1" },
      { category: "X", severity: "info", message: "i1" },
    ];
    expect(summarise(findings)).toEqual({
      blockers: 2,
      majors: 1,
      minors: 1,
      info: 1,
    });
  });

  it("returns zeros for empty", () => {
    expect(summarise([])).toEqual({
      blockers: 0,
      majors: 0,
      minors: 0,
      info: 0,
    });
  });
});
