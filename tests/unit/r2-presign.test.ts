import { afterEach, describe, expect, it, vi } from "vitest";
import { getR2DirectConfig, presignR2Put, presignUrl } from "@/lib/r2-presign";

afterEach(() => vi.unstubAllEnvs());

describe("SigV4 presigned URLs", () => {
  it("matches the official AWS S3 example (GET examplebucket/test.txt, 2013-05-24)", async () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
    const url = await presignUrl({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      expiresSeconds: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
        "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
        "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
        "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("signs size and type of an R2 upload: one key, one method, short expiry", async () => {
    const url = new URL(
      await presignR2Put(
        { accountId: "0123456789abcdef0123456789abcdef", accessKeyId: "AK", secretAccessKey: "SK" },
        "vision-pelusa-originals",
        "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "image/jpeg",
        27_000_000,
      ),
    );
    expect(url.host).toBe("0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/vision-pelusa-originals/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Credential")).toMatch(/^AK\/\d{8}\/auto\/s3\/aws4_request$/);
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.toString()).not.toContain("SK");
  });

  it("is disabled (Worker uploads) unless account id + key pair are configured", () => {
    vi.stubEnv("R2_ACCOUNT_ID", "");
    vi.stubEnv("R2_ACCESS_KEY_ID", "");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    expect(getR2DirectConfig()).toBeNull();
    vi.stubEnv("R2_ACCOUNT_ID", "0123456789abcdef0123456789abcdef");
    vi.stubEnv("R2_ACCESS_KEY_ID", "AK");
    expect(getR2DirectConfig()).toBeNull();
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "SK");
    expect(getR2DirectConfig()).toEqual({ accountId: "0123456789abcdef0123456789abcdef", accessKeyId: "AK", secretAccessKey: "SK" });
  });
});
