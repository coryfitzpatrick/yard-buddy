import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSendEachForMulticast,
  mockMessaging,
  mockInitializeApp,
  mockCert,
  mockGetApps,
  mockFindMany,
  mockUpdate,
  mockDeleteMany,
} = vi.hoisted(() => {
  const mockSendEachForMulticast = vi.fn();
  return {
    mockSendEachForMulticast,
    mockMessaging: vi.fn(() => ({ sendEachForMulticast: mockSendEachForMulticast })),
    mockInitializeApp: vi.fn(),
    mockCert: vi.fn(),
    mockGetApps: vi.fn(() => [] as unknown[]),
    mockFindMany: vi.fn(),
    mockUpdate: vi.fn(),
    mockDeleteMany: vi.fn(),
  };
});

vi.mock("firebase-admin/app", () => ({
  initializeApp: mockInitializeApp,
  cert: mockCert,
  getApps: mockGetApps,
}));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: mockMessaging,
}));

vi.mock("@/lib/db", () => ({
  db: {
    deviceToken: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

import { sendPushToUser } from "@/lib/push/send";

beforeEach(() => {
  mockSendEachForMulticast.mockReset();
  mockFindMany.mockReset();
  mockUpdate.mockReset();
  mockDeleteMany.mockReset();
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    project_id: "test",
    client_email: "x@y.iam.gserviceaccount.com",
    private_key: "fake",
  });
});

describe("sendPushToUser", () => {
  it("returns zero counts without sending if the user has no device tokens", async () => {
    mockFindMany.mockResolvedValue([]);
    await expect(sendPushToUser("u1", { title: "T", body: "B" })).resolves.toEqual({
      tokens: 0,
      success: 0,
      failed: 0,
    });
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("sends a multicast to all tokens and updates lastUsedAt on success", async () => {
    mockFindMany.mockResolvedValue([
      { id: "dt1", token: "tok1", platform: "ios", failureCount: 0 },
      { id: "dt2", token: "tok2", platform: "android", failureCount: 0 },
    ]);
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });
    await expect(
      sendPushToUser("u1", { title: "T", body: "B", data: { yardId: "y1" } }),
    ).resolves.toEqual({ tokens: 2, success: 2, failed: 0 });
    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["tok1", "tok2"],
        notification: { title: "T", body: "B" },
        data: { yardId: "y1" },
      }),
    );
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it("increments failureCount on per-token failures and deletes at threshold", async () => {
    mockFindMany.mockResolvedValue([
      { id: "dt1", token: "tok1", platform: "ios", failureCount: 2 },
      { id: "dt2", token: "tok2", platform: "android", failureCount: 0 },
    ]);
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
        { success: true },
      ],
    });
    await expect(sendPushToUser("u1", { title: "T", body: "B" })).resolves.toEqual({
      tokens: 2,
      success: 1,
      failed: 1,
    });
    // dt1 had failureCount 2, now 3 -> deleted
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: "dt1" } });
    // dt2 succeeded -> lastUsedAt updated
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dt2" } }),
    );
  });

  it("does not throw when a per-token bookkeeping update fails (uses Promise.allSettled)", async () => {
    mockFindMany.mockResolvedValue([
      { id: "dt1", token: "tok1", platform: "ios", failureCount: 0 },
      { id: "dt2", token: "tok2", platform: "android", failureCount: 0 },
    ]);
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });
    // Make the second update fail
    let callIdx = 0;
    mockUpdate.mockImplementation(() => {
      callIdx++;
      if (callIdx === 2) return Promise.reject(new Error("db write failed"));
      return Promise.resolve({});
    });

    // Return value reflects the FCM-level counts, unaffected by a bookkeeping write throwing.
    await expect(sendPushToUser("u1", { title: "T", body: "B" })).resolves.toEqual({
      tokens: 2,
      success: 2,
      failed: 0,
    });
  });
});
