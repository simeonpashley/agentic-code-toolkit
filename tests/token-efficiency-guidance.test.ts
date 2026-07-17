import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL_PATH = join(
  import.meta.dirname,
  "..",
  "skills",
  "token-efficiency",
  "SKILL.md",
);
const AGENT_AGENTS_PATH = join(import.meta.dirname, "..", "agent", "AGENTS.md");

describe("token-efficiency global guidance", () => {
  const skillContent = readFileSync(SKILL_PATH, "utf-8");
  const agentAgentsContent = readFileSync(AGENT_AGENTS_PATH, "utf-8");

  describe("skills/token-efficiency/SKILL.md", () => {
    it("references Phase 1 mechanical enforcement (token-hygiene warnings)", () => {
      // Must mention that the token-hygiene extension provides mechanical Phase 1 warnings
      const mentionsMechanical =
        /mechanical enforcement|token.hygiene|Phase 1|advisory warn/gi.test(
          skillContent,
        );
      expect(mentionsMechanical).toBe(true);
    });

    it("mentions specific Phase 1 warning classes", () => {
      // Must reference at least two of the delivered warning classes
      const warningClasses = [
        /duplicate read/i,
        /repeated search/i,
        /bash.*nudge|file.dump/i,
        /large read/i,
        /token.hygiene report|\/token-hygiene/i,
      ];
      const matchCount = warningClasses.filter((re) =>
        re.test(skillContent),
      ).length;
      expect(matchCount).toBeGreaterThanOrEqual(2);
    });

    it("states all Phase 1 warnings are advisory (never cancel/replace/mutate)", () => {
      const advisory =
        /advisory|warn.*only|never cancel|never replace|never mutat|pass.through/i.test(
          skillContent,
        );
      expect(advisory).toBe(true);
    });

    it("does NOT claim Phase 2 compression is active or implemented", () => {
      // Must not suggest Phase 2 compression is running now
      const lines = skillContent.split("\n");
      for (const line of lines) {
        // Allow "Phase 2" only when paired with "not implemented" / "deferred" / "future" / "preparation" / "not active"
        if (
          /Phase 2/i.test(line) &&
          !/not implemented|deferred|future|requires|pending|out of scope|follow.up|preparation|not.*active/i.test(
            line,
          )
        ) {
          expect.fail(`Line implies Phase 2 is active: "${line.trim()}"`);
        }
      }
      // Also must not claim compression is active without phase qualifier
      const impliesActive =
        /compression is (active|enabled|running|implemented)/i.test(
          skillContent,
        );
      expect(impliesActive).toBe(false);
    });
  });

  describe("agent/AGENTS.md", () => {
    it("references token-hygiene extension mechanics", () => {
      // Must point to the extension as mechanical enforcement
      const mentions = /token.hygiene|Phase 1 warn/i.test(agentAgentsContent);
      expect(mentions).toBe(true);
    });
  });
});
