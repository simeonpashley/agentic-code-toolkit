#!/usr/bin/env npx tsx
/**
 * URL Audit Script — standalone SEO/structured-data/social-metadata audit.
 *
 * Fetches a live URL (public-facing or local dev like http://localhost:3000)
 * and audits discoverability basics:
 *   - HTTP status, redirect chain, response time, content-type
 *   - Title, meta description, canonical, robots meta, viewport, lang
 *   - Heading hierarchy (h1/h2 counts)
 *   - Social metadata (Open Graph, Twitter Cards)
 *   - Structured data (JSON-LD, Microdata, RDFa)
 *   - Crawl directives (X-Robots-Tag, robots meta)
 *
 * Exits with:
 *   0 — no blockers or majors
 *   1 — minors or info only
 *   2 — majors found
 *   3 — blockers found
 *
 * Usage:
 *   npx tsx scripts/audit-url.ts <url> [--format=markdown|json]
 *                                    [--timeout=10]
 *                                    [--max-redirects=5]
 *                                    [--no-follow-redirects]
 *                                    [--user-agent="..."]
 *
 * Examples:
 *   npx tsx scripts/audit-url.ts https://example.com
 *   npx tsx scripts/audit-url.ts http://localhost:3000 --format=json
 */

import { argv, exit, stderr, stdout } from "node:process";

// ── Types ──────────────────────────────────────────────────────────────

export type Severity = "blocker" | "major" | "minor" | "info";

export interface Finding {
  category: string;
  severity: Severity;
  message: string;
  location?: string;
  fix?: string;
}

export interface StructuredDataBlock {
  format: "json-ld" | "microdata" | "rdfa";
  types: string[];
  raw: string;
  parseError?: string;
  validationErrors: string[];
}

export interface SocialMeta {
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
}

export interface SeoMeta {
  title: string | null;
  titleLength: number | null;
  metaDescription: string | null;
  metaDescriptionLength: number | null;
  canonical: string | null;
  robotsMeta: string | null;
  viewport: string | null;
  charset: string | null;
  lang: string | null;
  h1Count: number;
  h2Count: number;
  favicon: string | null;
}

export interface CrawlDirectives {
  robotsMeta: string | null;
  xRobotsTag: string | null;
  noindex: boolean;
  nofollow: boolean;
}

export interface AuditResult {
  inputUrl: string;
  finalUrl: string;
  statusCode: number;
  redirectChain: string[];
  responseTimeMs: number;
  contentType: string;
  httpHeaders: Record<string, string>;
  seo: SeoMeta;
  social: SocialMeta;
  structuredData: StructuredDataBlock[];
  crawl: CrawlDirectives;
  findings: Finding[];
  summary: {
    blockers: number;
    majors: number;
    minors: number;
    info: number;
  };
}

// ── CLI parsing ────────────────────────────────────────────────────────

export interface CliOptions {
  url: string;
  format: "markdown" | "json";
  timeout: number;
  maxRedirects: number;
  followRedirects: boolean;
  userAgent: string;
  includeHeaders: boolean;
}

export function parseArgs(args: string[]): CliOptions {
  if (args.length === 0 || args[0]!.startsWith("-")) {
    stderr.write("Usage: npx tsx scripts/audit-url.ts <url> [options]\n");
    exit(2);
  }
  const opts: CliOptions = {
    url: args[0]!,
    format: "markdown",
    timeout: 10,
    maxRedirects: 5,
    followRedirects: true,
    userAgent:
      "agentic-code-toolkit-audit-url/1.0 (+https://github.com/example/agentic-code-toolkit)",
    includeHeaders: false,
  };
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--format=json") opts.format = "json";
    else if (arg === "--format=markdown") opts.format = "markdown";
    else if (arg.startsWith("--timeout=")) {
      const v = Number(arg.slice("--timeout=".length));
      if (Number.isFinite(v) && v > 0) opts.timeout = v;
    } else if (arg.startsWith("--max-redirects=")) {
      const v = Number(arg.slice("--max-redirects=".length));
      if (Number.isFinite(v) && v >= 0) opts.maxRedirects = v;
    } else if (arg === "--no-follow-redirects") opts.followRedirects = false;
    else if (arg.startsWith("--user-agent=")) {
      opts.userAgent = arg.slice("--user-agent=".length);
    } else if (arg === "--include-headers") opts.includeHeaders = true;
    else if (arg === "--help" || arg === "-h") {
      stdout.write(`Usage: npx tsx scripts/audit-url.ts <url> [options]

Options:
  --format=markdown|json    Output format (default: markdown)
  --timeout=<seconds>       Fetch timeout (default: 10)
  --max-redirects=<count>   Maximum redirects to follow (default: 5)
  --no-follow-redirects     Do not follow redirects
  --user-agent="<string>"   Custom User-Agent header
  --include-headers         Include HTTP headers in JSON output
  -h, --help                Show this help
`);
      exit(0);
    } else {
      stderr.write(`Unknown option: ${arg}\n`);
      exit(2);
    }
  }
  return opts;
}

// ── Fetch ──────────────────────────────────────────────────────────────

export async function fetchWithRedirects(
  url: string,
  opts: CliOptions,
): Promise<{
  response: Response;
  redirectChain: string[];
  elapsed: number;
}> {
  const chain: string[] = [];
  let current = url;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, opts.timeout * 1000);
  const start = Date.now();
  try {
    let response: Response;
    for (let i = 0; i <= opts.maxRedirects; i++) {
      response = await fetch(current, {
        method: "GET",
        redirect: opts.followRedirects ? "follow" : "manual",
        signal: controller.signal,
        headers: { "User-Agent": opts.userAgent, Accept: "text/html,*/*" },
      });
      if (i > 0 || response.redirected) {
        chain.push(current);
      }
      if (
        !opts.followRedirects ||
        response.status < 300 ||
        response.status >= 400
      ) {
        return { response, redirectChain: chain, elapsed: Date.now() - start };
      }
      // Manual redirect handling when not using fetch's built-in follow
      const location = response.headers.get("location");
      if (!location) break;
      current = new URL(location, current).toString();
    }
    return {
      response: response!,
      redirectChain: chain,
      elapsed: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── HTML parsing ───────────────────────────────────────────────────────

/**
 * Strip script and style blocks before parsing meta tags to avoid matching
 * schema.org strings inside JS source.
 */
export function stripBlocks(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
}

export function attr(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function getMetaContent(
  html: string,
  attrName: string,
  attrValue: string,
): string | null {
  // Match <meta name="..." content="..."> or <meta property="..." content="...">
  const re = new RegExp(
    `<meta\\s+[^>]*${attrName}=["']${attrValue}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const m = html.match(re);
  if (m) return attr(m[1]!);
  // Try reversed attribute order
  const re2 = new RegExp(
    `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*${attrName}=["']${attrValue}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? attr(m2[1]!) : null;
}

export function getMetaContents(
  html: string,
  attrName: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  const re = new RegExp(
    `<meta\\s+[^>]*${attrName}=["']([^"']+)["'][^>]*content=["']([^"']*)["']`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out[attr(m[1]!)] = attr(m[2]!);
  }
  return out;
}

export function getTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? attr(m[1]!.trim()) : null;
}

export function getCanonical(html: string): string | null {
  const m = html.match(
    /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i,
  );
  if (m) return attr(m[1]!);
  const m2 = html.match(
    /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i,
  );
  return m2 ? attr(m2[1]!) : null;
}

export function getFavicon(html: string, base: string): string | null {
  const m = html.match(
    /<link\s+[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i,
  );
  if (m) {
    try {
      return new URL(attr(m[1]!), base).toString();
    } catch {
      return attr(m[1]!);
    }
  }
  return null;
}

export function getLang(html: string): string | null {
  const m = html.match(/<html\s[^>]*lang=["']([^"']+)["']/i);
  return m ? attr(m[1]!) : null;
}

export function getCharset(html: string): string | null {
  const m = html.match(/<meta\s[^>]*charset=["']?([^"'\s>]+)/i);
  return m ? attr(m[1]!) : null;
}

export function countHeadings(html: string, tag: "h1" | "h2"): number {
  const re = new RegExp(`<${tag}\\b`, "gi");
  return (html.match(re) ?? []).length;
}

// ── Structured data extraction ─────────────────────────────────────────

export function extractJsonLd(html: string): StructuredDataBlock[] {
  const blocks: StructuredDataBlock[] = [];
  const re =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]!.trim();
    const block: StructuredDataBlock = {
      format: "json-ld",
      types: [],
      raw,
      validationErrors: [],
    };
    try {
      const parsed = JSON.parse(raw);
      // fall back to the parsed object itself or its array form.
      const collect = (acc: string[], obj: any): void => {
        if (!obj || typeof obj !== "object") return;
        const t = obj["@type"];
        if (typeof t === "string") acc.push(t);
        else if (Array.isArray(t)) acc.push(...t);
        if (Array.isArray(obj["@graph"])) {
          for (const child of obj["@graph"]) collect(acc, child);
        }
      };
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) collect(block.types, item);
    } catch (e) {
      block.parseError = (e as Error).message;
    }
    blocks.push(block);
  }
  return blocks;
}

export function extractMicrodata(html: string): StructuredDataBlock[] {
  const blocks: StructuredDataBlock[] = [];
  const itemRe = /<([\w-]+)\s[^>]*itemscope\b[^>]*itemtype=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(html)) !== null) {
    const itemtype = attr(m[2]!);
    const typeMatch = itemtype.match(/schema\.org\/?(\w+)/i);
    const type = typeMatch ? typeMatch[1]! : itemtype;
    blocks.push({
      format: "microdata",
      types: [type],
      raw: `${m[1]} itemtype="${itemtype}"`,
      validationErrors: [],
    });
  }
  return blocks;
}

export function extractRdfa(html: string): StructuredDataBlock[] {
  const blocks: StructuredDataBlock[] = [];
  const re = /\btypeof=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const v = attr(m[1]!);
    if (seen.has(v)) continue;
    seen.add(v);
    blocks.push({
      format: "rdfa",
      types: [v],
      raw: `typeof="${v}"`,
      validationErrors: [],
    });
  }
  return blocks;
}

// ── Structured data validation ─────────────────────────────────────────

const REQUIRED_PROPS: Record<string, string[]> = {
  Article: ["headline", "author", "datePublished"],
  NewsArticle: ["headline", "datePublished"],
  BlogPosting: ["headline", "author", "datePublished"],
  Product: ["name", "image"],
  Organization: ["name", "url", "logo"],
  Person: ["name"],
  WebSite: ["name", "url"],
  BreadcrumbList: ["itemListElement"],
  FAQPage: ["mainEntity"],
  QAPage: ["mainEntity"],
  HowTo: ["step"],
  Recipe: ["name", "recipeIngredient", "recipeInstructions"],
  Event: ["name", "startDate", "location"],
  LocalBusiness: ["name", "address"],
  SoftwareApplication: ["name", "operatingSystem", "applicationCategory"],
  VideoObject: ["name", "thumbnailUrl", "uploadDate"],
  Review: ["itemReviewed", "reviewRating"],
};

const ANTI_PATTERNS: Array<{
  type: string;
  detect: (obj: any) => string | null;
}> = [
  {
    type: "self-serving Review",
    detect: (obj) => {
      if (obj["@type"] !== "Review") return null;
      const author = obj.author;
      if (typeof author === "object" && author?.name) {
        const itemReviewed = obj.itemReviewed;
        if (
          typeof itemReviewed === "object" &&
          itemReviewed?.brand?.name &&
          itemReviewed.brand.name === author.name
        ) {
          return "self-serving Review: author and brand are the same entity — Google ignores";
        }
      }
      return null;
    },
  },
  {
    type: "single-review AggregateRating",
    detect: (obj) => {
      if (!("aggregateRating" in obj)) return null;
      const rating = obj.aggregateRating;
      if (
        rating?.reviewCount !== undefined &&
        Number(rating.reviewCount) <= 1
      ) {
        return "single-review AggregateRating: reviewCount ≤ 1 — Google ignores";
      }
      return null;
    },
  },
];

export function validateStructuredData(
  blocks: StructuredDataBlock[],
): StructuredDataBlock[] {
  for (const block of blocks) {
    if (block.format !== "json-ld") continue;
    if (block.parseError) {
      block.validationErrors.push(`JSON parse error: ${block.parseError}`);
      continue;
    }
    try {
      const parsed = JSON.parse(block.raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const type = item["@type"];
        const types = Array.isArray(type) ? type : [type];
        for (const t of types) {
          if (typeof t !== "string") continue;
          const required = REQUIRED_PROPS[t];
          if (required) {
            for (const prop of required) {
              if (!(prop in item) || item[prop] === null || item[prop] === "") {
                block.validationErrors.push(
                  `${t} missing required property: ${prop}`,
                );
              }
            }
          }
          for (const ap of ANTI_PATTERNS) {
            const err = ap.detect(item);
            if (err) block.validationErrors.push(`Anti-pattern: ${err}`);
          }
        }
      }
    } catch {
      // already captured
    }
  }
  return blocks;
}

// ── Findings ───────────────────────────────────────────────────────────

export function buildFindings(
  result: Omit<AuditResult, "findings" | "summary">,
): Finding[] {
  const findings: Finding[] = [];

  // HTTP status
  if (result.statusCode >= 500) {
    findings.push({
      category: "HTTP",
      severity: "blocker",
      message: `Server error: HTTP ${result.statusCode}`,
    });
  } else if (result.statusCode === 404) {
    findings.push({
      category: "HTTP",
      severity: "major",
      message: "Page returns 404 Not Found",
    });
  } else if (result.statusCode >= 400) {
    findings.push({
      category: "HTTP",
      severity: "major",
      message: `Client error: HTTP ${result.statusCode}`,
    });
  } else if (result.statusCode >= 300) {
    findings.push({
      category: "HTTP",
      severity: "info",
      message: `HTTP ${result.statusCode} redirect (chain of ${result.redirectChain.length})`,
    });
  }

  // Response time
  if (result.responseTimeMs > 3000) {
    findings.push({
      category: "Performance",
      severity: "major",
      message: `Slow response: ${result.responseTimeMs}ms (>3s)`,
    });
  } else if (result.responseTimeMs > 1000) {
    findings.push({
      category: "Performance",
      severity: "minor",
      message: `Sluggish response: ${result.responseTimeMs}ms (>1s)`,
    });
  }

  // Content-Type
  if (!result.contentType.toLowerCase().includes("text/html")) {
    findings.push({
      category: "HTTP",
      severity: "minor",
      message: `Unexpected Content-Type: ${result.contentType}`,
    });
  }

  // SEO basics
  const seo = result.seo;
  if (!seo.title) {
    findings.push({
      category: "SEO",
      severity: "major",
      message: "Missing <title> tag",
    });
  } else if (seo.titleLength! < 30) {
    findings.push({
      category: "SEO",
      severity: "minor",
      message: `Title too short: ${seo.titleLength} chars (recommend 50–60)`,
      location: "<title>",
    });
  } else if (seo.titleLength! > 65) {
    findings.push({
      category: "SEO",
      severity: "minor",
      message: `Title too long: ${seo.titleLength} chars (will truncate in SERPs, recommend ≤60)`,
      location: "<title>",
    });
  }
  if (!seo.metaDescription) {
    findings.push({
      category: "SEO",
      severity: "minor",
      message: "Missing meta description (no auto-generated snippet in SERPs)",
      location: "<meta name='description'>",
      fix: "Add <meta name='description' content='...'> with 140–160 chars",
    });
  } else if (
    seo.metaDescriptionLength! < 70 ||
    seo.metaDescriptionLength! > 160
  ) {
    findings.push({
      category: "SEO",
      severity: "minor",
      message: `Meta description length suboptimal: ${seo.metaDescriptionLength} chars (recommend 140–160)`,
      location: "<meta name='description'>",
    });
  }
  if (!seo.canonical) {
    findings.push({
      category: "SEO",
      severity: "minor",
      message: "Missing canonical URL (risk of duplicate-content dilution)",
      fix: "Add <link rel='canonical' href='...'>",
    });
  }
  if (!seo.viewport) {
    findings.push({
      category: "SEO",
      severity: "major",
      message: "Missing viewport meta (mobile rendering broken)",
      fix: "Add <meta name='viewport' content='width=device-width, initial-scale=1'>",
    });
  }
  if (!seo.lang) {
    findings.push({
      category: "SEO",
      severity: "minor",
      message: "Missing lang attribute on <html>",
      fix: "Add lang='en' (or appropriate) to <html>",
    });
  }
  if (seo.h1Count === 0) {
    findings.push({
      category: "SEO",
      severity: "major",
      message: "No <h1> on page",
    });
  } else if (seo.h1Count > 1) {
    findings.push({
      category: "SEO",
      severity: "minor",
      message: `Multiple <h1> tags: ${seo.h1Count} (recommend exactly 1)`,
    });
  }

  // Social metadata
  if (!result.social.openGraph["og:title"]) {
    findings.push({
      category: "Social",
      severity: "minor",
      message:
        "Missing og:title (poor share preview on Facebook, LinkedIn, Slack, Discord)",
    });
  }
  if (!result.social.openGraph["og:description"]) {
    findings.push({
      category: "Social",
      severity: "minor",
      message: "Missing og:description",
    });
  }
  if (!result.social.openGraph["og:image"]) {
    findings.push({
      category: "Social",
      severity: "minor",
      message: "Missing og:image (no preview thumbnail when shared)",
    });
  }
  if (!result.social.openGraph["og:type"]) {
    findings.push({
      category: "Social",
      severity: "info",
      message: "Missing og:type (defaults to 'website')",
    });
  }
  if (!result.social.twitter["twitter:card"]) {
    findings.push({
      category: "Social",
      severity: "info",
      message: "Missing twitter:card (falls back to OG on most platforms)",
    });
  }

  // Structured data findings
  const allTypes = new Set<string>();
  let parseErrors = 0;
  let validationErrors = 0;
  for (const block of result.structuredData) {
    for (const t of block.types) allTypes.add(t);
    if (block.parseError) parseErrors++;
    validationErrors += block.validationErrors.length;
  }
  if (allTypes.size === 0) {
    findings.push({
      category: "Structured Data",
      severity: "minor",
      message: "No structured data detected (no JSON-LD, Microdata, or RDFa)",
      fix: "Add JSON-LD via <script type='application/ld+json'> with at least Organization + WebSite for the page",
    });
  }
  if (parseErrors > 0) {
    findings.push({
      category: "Structured Data",
      severity: "blocker",
      message: `${parseErrors} JSON-LD block(s) failed to parse — Google ignores invalid structured data entirely`,
    });
  }
  if (validationErrors > 0) {
    const blocking = result.structuredData.some(
      (b) => b.validationErrors.length > 0,
    );
    findings.push({
      category: "Structured Data",
      severity: blocking ? "major" : "minor",
      message: `${validationErrors} structured data validation issue(s) found`,
      fix: "See structured data block details in output",
    });
  }

  // AI-citation opportunity
  const hasFAQ = allTypes.has("FAQPage");
  const hasHowTo = allTypes.has("HowTo");
  const hasQA = allTypes.has("QAPage");
  const hasArticle =
    allTypes.has("Article") ||
    allTypes.has("NewsArticle") ||
    allTypes.has("BlogPosting");
  if (!hasFAQ && !hasHowTo && !hasQA && hasArticle) {
    findings.push({
      category: "AI Citation",
      severity: "minor",
      message:
        "Article schema present but no FAQPage, HowTo, or QAPage — these are the most-cited schemas for AI Overviews and answer engines",
      fix: "If the page answers questions, add FAQPage schema with the question/answer pairs that are visible in the content",
    });
  }

  // Crawl directives
  if (result.crawl.noindex && result.crawl.nofollow) {
    findings.push({
      category: "Crawl",
      severity: "blocker",
      message:
        "Page is noindex,nofollow — will not appear in search or be followed",
    });
  } else if (result.crawl.noindex) {
    findings.push({
      category: "Crawl",
      severity: "info",
      message: "Page is noindex (deliberate?)",
    });
  }

  return findings;
}

export function summarise(findings: Finding[]): AuditResult["summary"] {
  const s = { blockers: 0, majors: 0, minors: 0, info: 0 };
  for (const f of findings) {
    if (f.severity === "blocker") s.blockers++;
    else if (f.severity === "major") s.majors++;
    else if (f.severity === "minor") s.minors++;
    else if (f.severity === "info") s.info++;
  }
  return s;
}

// ── Output formatting ───────────────────────────────────────────────────

export function formatMarkdown(r: AuditResult, opts: CliOptions): string {
  const lines: string[] = [];
  const sym = (sev: Severity): string =>
    ({ blocker: "🔴", major: "🟠", minor: "🟡", info: "🔵" })[sev];

  lines.push(`# URL Audit: ${r.inputUrl}`);
  lines.push("");
  lines.push(`- **Final URL:** ${r.finalUrl}`);
  lines.push(`- **Status:** HTTP ${r.statusCode}`);
  lines.push(`- **Content-Type:** ${r.contentType}`);
  lines.push(`- **Response time:** ${r.responseTimeMs}ms`);
  if (r.redirectChain.length > 0) {
    lines.push(`- **Redirect chain:** ${r.redirectChain.join(" → ")}`);
  }
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(
    `- ${r.summary.blockers} blocker(s), ${r.summary.majors} major, ${r.summary.minors} minor, ${r.summary.info} info`,
  );
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  if (r.findings.length === 0) {
    lines.push("No findings — page passes discoverability checks.");
  } else {
    const bySeverity: Record<Severity, Finding[]> = {
      blocker: [],
      major: [],
      minor: [],
      info: [],
    };
    for (const f of r.findings) bySeverity[f.severity].push(f);
    for (const sev of ["blocker", "major", "minor", "info"] as Severity[]) {
      const list = bySeverity[sev];
      if (list.length === 0) continue;
      lines.push(`### ${sev.charAt(0).toUpperCase() + sev.slice(1)}s`);
      lines.push("");
      for (const f of list) {
        lines.push(`- ${sym(sev)} **${f.category}:** ${f.message}`);
        if (f.location) lines.push(`  - location: \`${f.location}\``);
        if (f.fix) lines.push(`  - fix: ${f.fix}`);
      }
      lines.push("");
    }
  }

  lines.push("## SEO Basics");
  lines.push("");
  lines.push(
    `- **Title:** ${r.seo.title ?? "_(missing)_"} (${r.seo.titleLength ?? 0} chars)`,
  );
  lines.push(
    `- **Meta description:** ${r.seo.metaDescription ?? "_(missing)_"} (${r.seo.metaDescriptionLength ?? 0} chars)`,
  );
  lines.push(`- **Canonical:** ${r.seo.canonical ?? "_(missing)_"}`);
  lines.push(`- **Viewport:** ${r.seo.viewport ?? "_(missing)_"}`);
  lines.push(`- **Charset:** ${r.seo.charset ?? "_(missing)_"}`);
  lines.push(`- **Lang:** ${r.seo.lang ?? "_(missing)_"}`);
  lines.push(`- **H1 count:** ${r.seo.h1Count}`);
  lines.push(`- **H2 count:** ${r.seo.h2Count}`);
  lines.push("");

  if (Object.keys(r.social.openGraph).length > 0) {
    lines.push("## Open Graph");
    lines.push("");
    for (const [k, v] of Object.entries(r.social.openGraph)) {
      lines.push(`- **${k}:** ${v}`);
    }
    lines.push("");
  }
  if (Object.keys(r.social.twitter).length > 0) {
    lines.push("## Twitter Card");
    lines.push("");
    for (const [k, v] of Object.entries(r.social.twitter)) {
      lines.push(`- **${k}:** ${v}`);
    }
    lines.push("");
  }

  if (r.structuredData.length > 0) {
    lines.push("## Structured Data");
    lines.push("");
    for (let i = 0; i < r.structuredData.length; i++) {
      const b = r.structuredData[i]!;
      lines.push(
        `### Block ${i + 1}: ${b.format} — ${b.types.join(", ") || "_(no @type)_"}`,
      );
      lines.push("");
      if (b.parseError) {
        lines.push(`**Parse error:** ${b.parseError}`);
        lines.push("");
      }
      if (b.validationErrors.length > 0) {
        lines.push("**Validation errors:**");
        for (const e of b.validationErrors) lines.push(`- ${e}`);
        lines.push("");
      }
    }
  } else {
    lines.push("## Structured Data");
    lines.push("");
    lines.push("_(none detected)_");
    lines.push("");
  }

  if (opts.includeHeaders) {
    lines.push("## HTTP Headers");
    lines.push("");
    for (const [k, v] of Object.entries(r.httpHeaders)) {
      lines.push(`- **${k}:** ${v}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatJson(r: AuditResult, opts: CliOptions): string {
  const out: Partial<AuditResult> = { ...r };
  if (!opts.includeHeaders) delete out.httpHeaders;
  // Truncate raw structured data to keep JSON output readable; full raw is
  // still useful in markdown which renders per-block.
  if (out.structuredData) {
    out.structuredData = out.structuredData.map((b) => ({
      ...b,
      raw: b.raw.length > 400 ? b.raw.slice(0, 400) + "…(truncated)" : b.raw,
    }));
  }
  return JSON.stringify(out, null, 2);
}

// ── Main ───────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  const opts = parseArgs(argv.slice(2));

  // Validate URL
  try {
    new URL(opts.url);
  } catch {
    stderr.write(`Invalid URL: ${opts.url}\n`);
    exit(2);
  }

  let fetchResult;
  try {
    fetchResult = await fetchWithRedirects(opts.url, opts);
  } catch (e) {
    const msg = (e as Error).message;
    stderr.write(`Fetch failed: ${msg}\n`);
    exit(2);
  }
  const { response, redirectChain, elapsed } = fetchResult;

  const headers: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    headers[k] = v;
  });

  const html = await response.text();
  const htmlForMeta = stripBlocks(html);

  const seo: SeoMeta = {
    title: getTitle(html),
    titleLength: null,
    metaDescription: getMetaContent(htmlForMeta, "name", "description"),
    metaDescriptionLength: null,
    canonical: getCanonical(html),
    robotsMeta: getMetaContent(htmlForMeta, "name", "robots"),
    viewport: getMetaContent(htmlForMeta, "name", "viewport"),
    charset: getCharset(html),
    lang: getLang(html),
    h1Count: countHeadings(html, "h1"),
    h2Count: countHeadings(html, "h2"),
    favicon: getFavicon(html, response.url),
  };
  if (seo.title) seo.titleLength = seo.title.length;
  if (seo.metaDescription)
    seo.metaDescriptionLength = seo.metaDescription.length;

  const ogTags = getMetaContents(htmlForMeta, "property");
  const openGraph: Record<string, string> = {};
  for (const [k, v] of Object.entries(ogTags)) {
    if (k.startsWith("og:")) openGraph[k] = v;
  }
  const twitterMeta = getMetaContent(htmlForMeta, "name", "twitter:card");
  const twitter: Record<string, string> = {};
  for (const [k, v] of Object.entries(ogTags)) {
    if (k.startsWith("twitter:")) twitter[k] = v;
  }
  if (twitterMeta) twitter["twitter:card"] = twitterMeta;
  // Also check <meta name="twitter:*"> explicitly
  for (const [k, v] of Object.entries(getMetaContents(htmlForMeta, "name"))) {
    if (k.startsWith("twitter:") && !twitter[k]) twitter[k] = v;
  }

  const structuredData = [
    ...extractJsonLd(html),
    ...extractMicrodata(html),
    ...extractRdfa(html),
  ];
  validateStructuredData(structuredData);

  const xRobotsTag = headers["x-robots-tag"] ?? null;
  const robotsCombined = [seo.robotsMeta, xRobotsTag]
    .filter(Boolean)
    .join(", ");
  const crawl: CrawlDirectives = {
    robotsMeta: seo.robotsMeta,
    xRobotsTag,
    noindex: /noindex/i.test(robotsCombined),
    nofollow: /nofollow/i.test(robotsCombined),
  };

  const partial: Omit<AuditResult, "findings" | "summary"> = {
    inputUrl: opts.url,
    finalUrl: response.url,
    statusCode: response.status,
    redirectChain,
    responseTimeMs: elapsed,
    contentType: headers["content-type"] ?? "",
    httpHeaders: headers,
    seo,
    social: { openGraph, twitter },
    structuredData,
    crawl,
  };

  const findings = buildFindings(partial);
  const summary = summarise(findings);
  const result: AuditResult = { ...partial, findings, summary };

  if (opts.format === "json") {
    stdout.write(formatJson(result, opts) + "\n");
  } else {
    stdout.write(formatMarkdown(result, opts) + "\n");
  }

  // Exit code: 3 = blocker, 2 = major, 1 = minor/info, 0 = clean
  if (summary.blockers > 0) exit(3);
  if (summary.majors > 0) exit(2);
  if (summary.minors > 0 || summary.info > 0) exit(1);
  exit(0);
}

// Only run main() when this file is the entry point (not when imported by tests)
const isMainModule = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main().catch((e: unknown) => {
    stderr.write(`Unexpected error: ${(e as Error).message}
`);
    exit(2);
  });
}
