import { describe, it, expect } from "vitest";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  registerSchema,
} from "@/lib/validations/auth";

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });
  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "notanemail" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts matching passwords of minimum length", () => {
    expect(
      resetPasswordSchema.safeParse({
        token: "abc123",
        password: "newpass1",
        confirmPassword: "newpass1",
      }).success
    ).toBe(true);
  });
  it("rejects when passwords don't match", () => {
    const result = resetPasswordSchema.safeParse({
      token: "abc123",
      password: "newpass1",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });
  it("rejects a password shorter than 8 characters", () => {
    expect(
      resetPasswordSchema.safeParse({
        token: "abc123",
        password: "short",
        confirmPassword: "short",
      }).success
    ).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("accepts valid current + new passwords", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "oldpass1",
        newPassword: "newpass1",
        confirmPassword: "newpass1",
      }).success
    ).toBe(true);
  });
  it("rejects when new passwords don't match", () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: "oldpass1",
      newPassword: "newpass1",
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });
  it("rejects a new password shorter than 8 characters", () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: "oldpass1",
        newPassword: "short",
        confirmPassword: "short",
      }).success
    ).toBe(false);
  });
});

const VALID_REGISTER = {
  name: "Alex",
  email: "alex@example.com",
  password: "password123",
  confirmPassword: "password123",
  acceptedTerms: true as const,
};

describe("registerSchema — acceptedTerms", () => {
  it("accepts a valid registration with acceptedTerms: true", () => {
    expect(registerSchema.safeParse(VALID_REGISTER).success).toBe(true);
  });

  it("rejects when acceptedTerms is false", () => {
    expect(registerSchema.safeParse({ ...VALID_REGISTER, acceptedTerms: false }).success).toBe(false);
  });

  it("rejects when acceptedTerms is missing", () => {
    const { acceptedTerms: _, ...without } = VALID_REGISTER;
    expect(registerSchema.safeParse(without).success).toBe(false);
  });

  it("rejects when passwords do not match", () => {
    expect(registerSchema.safeParse({ ...VALID_REGISTER, confirmPassword: "different" }).success).toBe(false);
  });
});
