import { describe, expect, it } from "vitest";
import {
  createDefaultDisplayName,
  isLegacyDefaultDisplayName,
  resolveGeneratedProfileDisplayName,
} from "./profile";

describe("profile display names", () => {
  it("creates a deterministic anonymous identity", () => {
    const first = createDefaultDisplayName("cf_ABCDEFGHJKLMNPQRST");
    const second = createDefaultDisplayName("cf_ABCDEFGHJKLMNPQRST");

    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z]+#[0-9]{4}$/u);
  });

  it("upgrades legacy generated names", () => {
    const profileId = "cf_ABCDEFGHJKLMNPQRST";
    const resolved = resolveGeneratedProfileDisplayName(profileId, "Clanker A1B2");

    expect(isLegacyDefaultDisplayName("Clanker A1B2")).toBe(true);
    expect(resolved).toBe(createDefaultDisplayName(profileId));
  });

  it("keeps a current generated name", () => {
    expect(resolveGeneratedProfileDisplayName("cf_ABCDEFGHJKLMNPQRST", "SneakyServo#0042")).toBe(
      "SneakyServo#0042",
    );
  });
});
