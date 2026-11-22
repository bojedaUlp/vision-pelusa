import { describe, expect, it } from "vitest";
import {
  budgetLevel,
  chunk,
  isSafeAlbumPath,
  parseIdList,
  photosSafeToFinalize,
  storageTargetsForPhoto,
  summarize,
  type PreparedPhoto,
} from "@/lib/photo-deletion-core";
import { mediaKeyFromUrl, protectedImageUrl } from "@/lib/protected-images";

const MATCH = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PHOTO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const photo = (overrides: Partial<PreparedPhoto> = {}): PreparedPhoto => ({
  photo_id: PHOTO,
  match_id: MATCH,
  outcome: "eligible",
  sold: false,
  original_key: `${MATCH}/${PHOTO}`,
  watermark_url: `/media/${MATCH}/${PHOTO}-preview.jpg`,
  thumbnail_url: `/media/${MATCH}/${PHOTO}-thumb.jpg`,
  bytes: 1000,
  ...overrides,
});

describe("parseIdList", () => {
  it("accepts unique lowercase UUIDs within the limit", () => {
    expect(parseIdList([PHOTO.toUpperCase(), PHOTO], 5)).toEqual([PHOTO]);
  });
  it("rejects manipulated ids, empty lists and oversized lists", () => {
    expect(parseIdList(["1 or 1=1"], 5)).toBeNull();
    expect(parseIdList([], 5)).toBeNull();
    expect(parseIdList("not-an-array", 5)).toBeNull();
    expect(parseIdList([MATCH, OTHER, PHOTO], 2)).toBeNull();
  });
});

describe("isSafeAlbumPath", () => {
  it("only allows keys inside the photo's own album folder", () => {
    expect(isSafeAlbumPath(`${MATCH}/foto.jpg`, MATCH)).toBe(true);
    expect(isSafeAlbumPath(`${OTHER}/foto.jpg`, MATCH)).toBe(false);
    expect(isSafeAlbumPath(`${MATCH}/../${OTHER}/foto.jpg`, MATCH)).toBe(false);
    expect(isSafeAlbumPath(`${MATCH}/`, MATCH)).toBe(false);
    expect(isSafeAlbumPath("foto.jpg", "not-a-uuid")).toBe(false);
  });
});

describe("public media URLs", () => {
  it("only renders our watermarked media, never originals or external URLs", () => {
    expect(protectedImageUrl(`/media/${MATCH}/x-thumb.jpg`)).toBe(`/media/${MATCH}/x-thumb.jpg`);
    expect(protectedImageUrl("https://evil.example/x.jpg")).toBeUndefined();
    expect(protectedImageUrl(`/media/../${MATCH}/x.jpg`)).toBeUndefined();
    expect(mediaKeyFromUrl(`/media/${MATCH}/a/b.jpg`)).toBeNull();
  });
});

describe("storageTargetsForPhoto", () => {
  it("returns the original (private bucket) and both watermarked files (public bucket)", () => {
    expect(storageTargetsForPhoto(photo())).toEqual([
      { bucket: "originals", key: `${MATCH}/${PHOTO}`, photoId: PHOTO },
      { bucket: "media", key: `${MATCH}/${PHOTO}-preview.jpg`, photoId: PHOTO },
      { bucket: "media", key: `${MATCH}/${PHOTO}-thumb.jpg`, photoId: PHOTO },
    ]);
  });

  it("never targets keys of another album or external URLs (only the photo's own derived keys)", () => {
    const targets = storageTargetsForPhoto(
      photo({ original_key: `${OTHER}/${PHOTO}`, watermark_url: "https://x.test/a.jpg", thumbnail_url: `/media/${OTHER}/t.jpg` }),
    );
    expect(targets).toEqual([
      { bucket: "media", key: `${MATCH}/${PHOTO}-preview.jpg`, photoId: PHOTO },
      { bucket: "media", key: `${MATCH}/${PHOTO}-thumb.jpg`, photoId: PHOTO },
    ]);
    expect(targets.every((t) => t.key.startsWith(`${MATCH}/`))).toBe(true);
  });

  it("an upload that failed before 'complete' (no URLs yet) still removes its preview and thumbnail", () => {
    expect(storageTargetsForPhoto(photo({ watermark_url: null, thumbnail_url: null }))).toEqual([
      { bucket: "originals", key: `${MATCH}/${PHOTO}`, photoId: PHOTO },
      { bucket: "media", key: `${MATCH}/${PHOTO}-preview.jpg`, photoId: PHOTO },
      { bucket: "media", key: `${MATCH}/${PHOTO}-thumb.jpg`, photoId: PHOTO },
    ]);
  });
});

describe("summarize", () => {
  it("separates eligible photos (including sold with expired downloads) from protected ones", () => {
    const rows = [
      photo({ photo_id: "a", outcome: "eligible", bytes: 100 }),
      photo({ photo_id: "b", outcome: "eligible", sold: true, bytes: 50 }),
      photo({ photo_id: "c", outcome: "download_active", sold: true }),
      photo({ photo_id: "d", outcome: "pending_payment" }),
      photo({ photo_id: "e", outcome: "already_deleted" }),
    ];
    expect(summarize(rows)).toEqual({
      total: 5,
      eligible: 2,
      eligibleSold: 1,
      downloadActive: 1,
      pendingPayment: 1,
      alreadyDeleted: 1,
      estimatedBytes: 150,
      eligibleIds: ["a", "b"],
    });
  });
});

describe("photosSafeToFinalize", () => {
  it("keeps a photo pending when any of its files failed", () => {
    const targets = [
      { bucket: "originals" as const, key: `${MATCH}/a`, photoId: "a" },
      { bucket: "media" as const, key: `${MATCH}/a-thumb.jpg`, photoId: "a" },
      { bucket: "originals" as const, key: `${MATCH}/b`, photoId: "b" },
    ];
    expect(photosSafeToFinalize(["a", "b"], targets, new Set([`media/${MATCH}/a-thumb.jpg`]))).toEqual({ ok: ["b"], failed: ["a"] });
  });
});

describe("budgetLevel", () => {
  it("warns at 80%, is critical at 95% and full at 100%", () => {
    expect(budgetLevel(1, 100)).toBe("ok");
    expect(budgetLevel(80, 100)).toBe("warning");
    expect(budgetLevel(95, 100)).toBe("critical");
    expect(budgetLevel(100, 100)).toBe("full");
  });
});

describe("chunk", () => {
  it("splits into batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
