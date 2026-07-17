import { describe, expect, it } from "vitest";
import {
  isConsentControl,
  requestPolicy,
} from "../skills/website-ux-audit/scripts/browser.ts";

describe("website UX audit request safety", () => {
  it("permits only the explicitly authorised private origin", () => {
    expect(
      requestPolicy(
        "http://127.0.0.1:3000/page",
        ["127.0.0.1"],
        true,
        "http://127.0.0.1:3000",
      ),
    ).toBe("allow");
    expect(
      requestPolicy(
        "http://10.0.0.5/admin",
        ["10.0.0.5"],
        true,
        "http://127.0.0.1:3000",
      ),
    ).toBe("block");
    expect(
      requestPolicy(
        "http://169.254.169.254/latest",
        ["169.254.169.254"],
        true,
        "http://127.0.0.1:3000",
      ),
    ).toBe("block");
  });

  it("does not treat generic continue or permission buttons as consent", () => {
    expect(isConsentControl("Continue", "checkout-panel")).toBe(false);
    expect(isConsentControl("Allow", "notification-permission")).toBe(false);
    expect(
      isConsentControl("Accept all cookies", "cookie-consent-banner"),
    ).toBe(true);
  });
});
