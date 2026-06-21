import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    biometricRefreshToken: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

import {
  generateRefreshToken,
  hashRefreshToken,
  validateRefreshToken,
} from "@/lib/auth/biometric-refresh";

beforeEach(() => {
  mockFindUnique.mockReset();
  mockUpdate.mockReset();
  mockCreate.mockReset();
});

describe("generateRefreshToken", () => {
  it("returns a base64url plaintext and its sha256 hex hash", () => {
    const { token, hash } = generateRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40); // base64url of 32 bytes
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashRefreshToken(token));
  });

  it("produces distinct tokens on successive calls", () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashRefreshToken", () => {
  it("is deterministic", () => {
    expect(hashRefreshToken("abc")).toBe(hashRefreshToken("abc"));
  });
  it("differs across inputs", () => {
    expect(hashRefreshToken("a")).not.toBe(hashRefreshToken("b"));
  });
});

describe("validateRefreshToken", () => {
  it("returns null when no row matches the hash", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await validateRefreshToken("nonexistent")).toBeNull();
  });

  it("returns null when row is revoked", async () => {
    mockFindUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      revokedAt: new Date(),
      createdAt: new Date(),
    });
    expect(await validateRefreshToken("any")).toBeNull();
  });

  it("returns null when createdAt is older than 90 days", async () => {
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    mockFindUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      revokedAt: null,
      createdAt: ninetyOneDaysAgo,
    });
    expect(await validateRefreshToken("any")).toBeNull();
  });

  it("returns userId and rowId on valid token", async () => {
    mockFindUnique.mockResolvedValue({
      id: "r1",
      userId: "u1",
      revokedAt: null,
      createdAt: new Date(),
    });
    const result = await validateRefreshToken("any");
    expect(result).toEqual({ userId: "u1", rowId: "r1" });
  });
});
