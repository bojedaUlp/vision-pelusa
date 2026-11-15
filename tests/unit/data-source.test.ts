import { afterEach, describe, expect, it, vi } from "vitest";

// Without Supabase configured the public pages fall back to the bundled demo data (local
// development). Ported from the old node:test file, which could not run (no TypeScript runner)
// and silently depended on the hardcoded production Supabase project.
async function loadWithoutSupabase() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  return import("@/lib/data-source");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("gallery slug resolution", () => {
  it("returns the exact match for a known slug and does not default to the first gallery for unknown slugs", async () => {
    const { getMatchBySlug } = await loadWithoutSupabase();

    const knownMatch = await getMatchBySlug("fecha-13");
    expect(knownMatch?.slug).toBe("fecha-13");

    const missingMatch = await getMatchBySlug("pelusa-vs-river");
    expect(missingMatch).toBeUndefined();
  });

  it("never reports Supabase as configured without environment values (no hardcoded project)", async () => {
    await loadWithoutSupabase();
    const { isSupabaseConfigured } = await import("@/lib/supabase");
    expect(isSupabaseConfigured()).toBe(false);
  });
});
