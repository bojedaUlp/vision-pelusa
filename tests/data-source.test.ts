/// <reference types="node" />

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMatchBySlug } from "../src/lib/data-source";

describe("gallery slug resolution", () => {
  it("returns the exact match for a known slug and does not default to the first gallery for unknown slugs", async () => {
    const knownMatch = await getMatchBySlug("fecha-13");
    assert.equal(knownMatch?.slug, "fecha-13");

    const missingMatch = await getMatchBySlug("pelusa-vs-river");
    assert.equal(missingMatch, undefined);
  });
});
