import { describe, it, expect } from "vitest";
import {
  ulidSchema,
  unixMsSchema,
  nonEmptyTrimmedStringSchema,
  optionalUrlSchema,
  serverUrlSchema,
  workspaceItemTypeSchema,
} from "./common.js";

const VALID_ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("ulidSchema", () => {
  it("accepts a valid 26-char ULID", () => {
    expect(ulidSchema.parse(VALID_ULID)).toBe(VALID_ULID);
  });

  it("accepts all-zero ULID", () => {
    const allZero = "00000000000000000000000000";
    expect(ulidSchema.parse(allZero)).toBe(allZero);
  });

  it("accepts max valid ULID", () => {
    const maxUlid = "7ZZZZZZZZZZZZZZZZZZZZZZZZZ";
    expect(ulidSchema.parse(maxUlid)).toBe(maxUlid);
  });

  it("rejects string that is too short", () => {
    const result = ulidSchema.safeParse("01ARZ3NDEKTSV4RRFFQ69G5FA");
    expect(result.success).toBe(false);
  });

  it("rejects string that is too long", () => {
    const result = ulidSchema.safeParse("01ARZ3NDEKTSV4RRFFQ69G5FAVX");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = ulidSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects lowercase characters", () => {
    const result = ulidSchema.safeParse("01arz3ndektsv4rrffq69g5fav");
    expect(result.success).toBe(false);
  });

  it("rejects invalid char I (excluded from Crockford base32)", () => {
    const withI = "01ARZ3NDEKTSV4RRFFQ69G5FAI";
    const result = ulidSchema.safeParse(withI);
    expect(result.success).toBe(false);
  });

  it("rejects invalid char L (excluded from Crockford base32)", () => {
    const withL = "01ARZ3NDEKTSV4RRFFQ69G5FAL";
    const result = ulidSchema.safeParse(withL);
    expect(result.success).toBe(false);
  });

  it("rejects invalid char O (excluded from Crockford base32)", () => {
    const withO = "01ARZ3NDEKTSV4RRFFQ69G5FAO";
    const result = ulidSchema.safeParse(withO);
    expect(result.success).toBe(false);
  });

  it("rejects invalid char U (excluded from Crockford base32)", () => {
    const withU = "01ARZ3NDEKTSV4RRFFQ69G5FAU";
    const result = ulidSchema.safeParse(withU);
    expect(result.success).toBe(false);
  });

  it("rejects non-string input", () => {
    const result = ulidSchema.safeParse(12345);
    expect(result.success).toBe(false);
  });
});

describe("unixMsSchema", () => {
  it("accepts zero", () => {
    expect(unixMsSchema.parse(0)).toBe(0);
  });

  it("accepts a typical unix timestamp in ms", () => {
    const ts = 1700000000000;
    expect(unixMsSchema.parse(ts)).toBe(ts);
  });

  it("accepts a positive integer", () => {
    expect(unixMsSchema.parse(1)).toBe(1);
  });

  it("rejects negative numbers", () => {
    const result = unixMsSchema.safeParse(-1);
    expect(result.success).toBe(false);
  });

  it("rejects floats", () => {
    const result = unixMsSchema.safeParse(1.5);
    expect(result.success).toBe(false);
  });

  it("rejects strings", () => {
    const result = unixMsSchema.safeParse("1700000000000");
    expect(result.success).toBe(false);
  });

  it("rejects NaN", () => {
    const result = unixMsSchema.safeParse(NaN);
    expect(result.success).toBe(false);
  });
});

describe("nonEmptyTrimmedStringSchema", () => {
  it("accepts a normal string", () => {
    expect(nonEmptyTrimmedStringSchema.parse("hello")).toBe("hello");
  });

  it("trims whitespace and accepts non-empty result", () => {
    expect(nonEmptyTrimmedStringSchema.parse("  hello  ")).toBe("hello");
  });

  it("accepts a single character", () => {
    expect(nonEmptyTrimmedStringSchema.parse("a")).toBe("a");
  });

  it("rejects empty string", () => {
    const result = nonEmptyTrimmedStringSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only string", () => {
    const result = nonEmptyTrimmedStringSchema.safeParse("   ");
    expect(result.success).toBe(false);
  });

  it("rejects non-string input", () => {
    const result = nonEmptyTrimmedStringSchema.safeParse(123);
    expect(result.success).toBe(false);
  });
});

describe("optionalUrlSchema", () => {
  it("accepts a valid http URL", () => {
    const result = optionalUrlSchema.parse("http://example.com");
    expect(result).toBe("http://example.com");
  });

  it("accepts a valid https URL", () => {
    const result = optionalUrlSchema.parse("https://example.com");
    expect(result).toBe("https://example.com");
  });

  it("accepts a data: URL", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANS";
    const result = optionalUrlSchema.parse(dataUrl);
    expect(result).toBe(dataUrl);
  });

  it("transforms empty string to null", () => {
    const result = optionalUrlSchema.parse("");
    expect(result).toBeNull();
  });

  it("transforms whitespace-only string to null (after trim)", () => {
    const result = optionalUrlSchema.parse("   ");
    expect(result).toBeNull();
  });

  it("rejects ftp URL", () => {
    const result = optionalUrlSchema.safeParse("ftp://example.com");
    expect(result.success).toBe(false);
  });

  it("rejects a plain string that is not a URL", () => {
    const result = optionalUrlSchema.safeParse("not-a-url");
    expect(result.success).toBe(false);
  });

  it("rejects non-string input", () => {
    const result = optionalUrlSchema.safeParse(123);
    expect(result.success).toBe(false);
  });

  it("trims whitespace around valid URL", () => {
    const result = optionalUrlSchema.parse("  https://example.com  ");
    expect(result).toBe("https://example.com");
  });
});

describe("serverUrlSchema", () => {
  it("accepts a valid https URL", () => {
    expect(serverUrlSchema.parse("https://example.com")).toBe("https://example.com");
  });

  it("accepts a valid http URL", () => {
    expect(serverUrlSchema.parse("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("trims whitespace", () => {
    expect(serverUrlSchema.parse("  https://example.com  ")).toBe("https://example.com");
  });

  it("rejects empty string", () => {
    const result = serverUrlSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects non-URL string", () => {
    const result = serverUrlSchema.safeParse("not-a-url");
    expect(result.success).toBe(false);
  });

  it("rejects non-string input", () => {
    const result = serverUrlSchema.safeParse(123);
    expect(result.success).toBe(false);
  });
});

describe("workspaceItemTypeSchema", () => {
  it('accepts "chat"', () => {
    expect(workspaceItemTypeSchema.parse("chat")).toBe("chat");
  });

  it('accepts "doc"', () => {
    expect(workspaceItemTypeSchema.parse("doc")).toBe("doc");
  });

  it("rejects other strings", () => {
    const result = workspaceItemTypeSchema.safeParse("task");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = workspaceItemTypeSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects non-string input", () => {
    const result = workspaceItemTypeSchema.safeParse(1);
    expect(result.success).toBe(false);
  });
});
