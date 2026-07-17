/**
 * TDD suite for sensitive-output detection.
 *
 * Spec: docs/specs/2026-07-07-token-hygiene-extension-spec.md
 *
 * Sensitive-output detection is conservative: it must fail closed
 * for "sensitive" and "unknown" classifications, meaning no
 * retention, compression, or storage of raw output.
 */

import { describe, it, expect } from "vitest";

import { classifySensitiveOutput } from "../extensions/token-hygiene/sensitive-output-detector";

describe("classifySensitiveOutput", () => {
  // ── not-sensitive ───────────────────────────────────────────────

  it("classifies empty output as not-sensitive", () => {
    expect(classifySensitiveOutput("")).toBe("not-sensitive");
  });

  it("classifies readable plain text as not-sensitive", () => {
    expect(classifySensitiveOutput("Hello world, this is normal output.")).toBe(
      "not-sensitive",
    );
  });

  it("classifies structured but benign data as not-sensitive", () => {
    const output = JSON.stringify({ status: "ok", result: 42 });
    expect(classifySensitiveOutput(output)).toBe("not-sensitive");
  });

  // ── sensitive ──────────────────────────────────────────────────

  it("classifies output containing known secret patterns as sensitive", () => {
    expect(classifySensitiveOutput("Bearer sk-ant-api03-secret-key-here")).toBe(
      "sensitive",
    );
  });

  it("classifies PEM private key material as sensitive", () => {
    const pem =
      "-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIICx\n-----END EC PRIVATE KEY-----";
    expect(classifySensitiveOutput(pem)).toBe("sensitive");
  });

  it("classifies SSH keys as sensitive", () => {
    // Must be long enough to exceed the 50-char base64 threshold
    const sshKey =
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDlO3eLXxG7L8fH9a0K4mN6pQ2rT5vW8xZ1yB3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV3wX4yZ5a";
    expect(classifySensitiveOutput(sshKey)).toBe("sensitive");
  });

  it("classifies GitHub tokens as sensitive", () => {
    expect(
      classifySensitiveOutput("ghp_abcdefghijklmnopqrstuvwxyz1234567890"),
    ).toBe("sensitive");
  });

  it("classifies AWS access keys as sensitive", () => {
    expect(classifySensitiveOutput("AKIAIOSFODNN7EXAMPLE")).toBe("sensitive");
  });

  it("classifies API keys with common prefixes as sensitive", () => {
    expect(classifySensitiveOutput("sk-live-abcdefghijklmnopqrstuvwxyz")).toBe(
      "sensitive",
    );
  });

  it("classifies bearer tokens in text as sensitive", () => {
    expect(
      classifySensitiveOutput(
        "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.token",
      ),
    ).toBe("sensitive");
  });

  // ── unknown ─────────────────────────────────────────────────────

  it("classifies binary-like or non-UTF-8 output as unknown", () => {
    // Binary content that can't be cleanly decoded
    const binaryBuffer = Buffer.from([0x00, 0xff, 0xfe, 0xfa, 0x00, 0x01]);
    const binaryContent = binaryBuffer.toString("utf-8");
    expect(classifySensitiveOutput(binaryContent)).toBe("unknown");
  });

  it("classifies output with only control characters as unknown", () => {
    const controlChars = "\x00\x01\x02\x03\x04\x05";
    expect(classifySensitiveOutput(controlChars)).toBe("unknown");
  });

  it("classifies extremely long output as unknown", () => {
    const longOutput = "x".repeat(1_000_000);
    expect(classifySensitiveOutput(longOutput)).toBe("unknown");
  });

  it("classifies garbled output as unknown", () => {
    const garbled = "\x00\x01\x02\xff\xfe\xfd\xfc\xfbsecret\x00key\x01\x02";
    expect(classifySensitiveOutput(garbled)).toBe("unknown");
  });

  // ── edge cases ──────────────────────────────────────────────────

  it("considers whitespace-only output as not-sensitive", () => {
    expect(classifySensitiveOutput("   \n\n\t  ")).toBe("not-sensitive");
  });

  it("considers null-like strings as not-sensitive", () => {
    expect(classifySensitiveOutput("null")).toBe("not-sensitive");
    expect(classifySensitiveOutput("undefined")).toBe("not-sensitive");
  });
});
