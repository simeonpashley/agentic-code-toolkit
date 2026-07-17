import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { glob as globSync } from "fast-glob";
// Ports of tools.py::_glob, _webfetch, _websearch. Pi ships its own grep/find,
// so those are not re-registered here.
export default function (pi: ExtensionAPI) {
  // ── glob ────────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "glob",
    label: "Glob",
    description:
      "Find files by glob pattern under a base directory. Use for repository discovery, locating source files, finding configs, and narrowing candidate files before reading them. Returns up to 500 sorted matching paths.",
    parameters: Type.Object({
      pattern: Type.String({
        description:
          "Glob pattern to match, for example `**/*.ts`, `src/**/*.py`, or `**/package.json`.",
      }),
      path: Type.Optional(
        Type.String({
          description:
            "Optional base directory for the search. Defaults to the current working directory.",
        }),
      ),
    }),
    async execute(_id, { pattern, path }) {
      try {
        const base = path || process.cwd();
        const matches: string[] = [];
        // fast-glob returns Promise<string[]>; await it.
        const found = await globSync(pattern, { cwd: base });
        for (const m of found) {
          matches.push(`${base}/${m}`);
          if (matches.length >= 500) break;
        }
        matches.sort();
        const text =
          matches.length === 0 ? "No files matched" : matches.join("\n");
        return {
          content: [{ type: "text", text }],
          details: {},
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ── webfetch ────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "webfetch",
    label: "WebFetch",
    description:
      "Fetch a URL and return stripped text content, capped at 25,000 characters. Use to inspect a known webpage, documentation page, changelog, issue, article, raw file, or API reference. Use `websearch` first when the target URL is not known. The optional prompt is a hint only; it does not guarantee extraction or filtering.",
    parameters: Type.Object({
      url: Type.String({ description: "Absolute URL to fetch." }),
      prompt: Type.Optional(
        Type.String({
          description:
            "Optional hint describing what to extract or focus on from the fetched content.",
        }),
      ),
    }),
    async execute(_id, { url }) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
          },
          redirect: "follow",
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Error: HTTP ${res.status} ${res.statusText}`,
              },
            ],
            details: {},
            isError: true,
          };
        }
        const ct = res.headers.get("content-type") || "";
        let text = await res.text();
        if (ct.includes("html")) {
          text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
          text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
          text = text.replace(/<[^>]+>/g, " ");
          text = text.replace(/\s+/g, " ").trim();
        }
        if (text.length > 25_000) text = text.slice(0, 25_000);
        return { content: [{ type: "text", text }], details: {} };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ── websearch ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "websearch",
    label: "WebSearch",
    description:
      "Search the web with DuckDuckGo and return the top results as Markdown. Use when you need current external information, official documentation, package pages, examples, issue reports, or a URL to fetch next. Prefer specific queries with library names, versions, error messages, API names, or domain filters when useful.",
    parameters: Type.Object({
      query: Type.String({
        description:
          "Search query. Include precise terms such as package name, version, error text, API method, framework, or site/domain constraint.",
      }),
    }),
    async execute(_id, { query }) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
          },
          redirect: "follow",
          signal: controller.signal,
        });
        clearTimeout(timer);
        const body = await res.text();
        const titleRe =
          /class="result__title"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/div>/g;
        const titles: Array<{ link: string; title: string }> = [];
        let m: RegExpExecArray | null;
        while ((m = titleRe.exec(body)) && titles.length < 8) {
          titles.push({
            link: m[1] ?? "",
            title: (m[2] ?? "").replace(/<[^>]+>/g, "").trim(),
          });
        }
        const snippets: string[] = [];
        while ((m = snippetRe.exec(body)) && snippets.length < 8) {
          snippets.push((m[1] ?? "").replace(/<[^>]+>/g, "").trim());
        }
        if (titles.length === 0) {
          return {
            content: [{ type: "text", text: "No results found" }],
            details: {},
          };
        }
        const out = titles
          .map((t, i) => `**${t.title}**\n${t.link}\n${snippets[i] ?? ""}`)
          .join("\n\n");
        return { content: [{ type: "text", text: out }], details: {} };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
          details: {},
          isError: true,
        };
      }
    },
  });
}
