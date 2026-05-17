import { beforeEach, describe, expect, it } from "vitest";
import type { TimelineStartJob } from "@pitch/domain";
import { memory, MemoryStorage } from "./memory";

describe("memory timeline start job leasing", () => {
  const storage = new MemoryStorage();

  beforeEach(() => {
    memory.timelineStartJobs.clear();
  });

  it("claims a pending job once and rejects a second active claim", async () => {
    await storage.saveTimelineStartJob(jobFixture({ status: "pending" }));

    const first = await storage.claimTimelineStartJob(claimFixture({ leaseToken: "lease-1" }));
    const second = await storage.claimTimelineStartJob(claimFixture({ leaseToken: "lease-2" }));

    expect(first).toMatchObject({
      status: "running",
      attempts: 1,
      leaseToken: "lease-1",
      leaseExpiresAt: "2026-05-17T12:06:00.000Z"
    });
    expect(second).toBeNull();
  });

  it("reclaims only expired running leases", async () => {
    await storage.saveTimelineStartJob(jobFixture({
      status: "running",
      attempts: 1,
      leaseToken: "old-lease",
      leaseExpiresAt: "2026-05-17T11:59:00.000Z",
      updatedAt: "2026-05-17T11:54:00.000Z",
      startedAt: "2026-05-17T11:54:00.000Z"
    }));

    const claimed = await storage.claimTimelineStartJob(claimFixture({ leaseToken: "new-lease" }));

    expect(claimed).toMatchObject({
      status: "running",
      attempts: 2,
      leaseToken: "new-lease",
      leaseExpiresAt: "2026-05-17T12:06:00.000Z",
      startedAt: "2026-05-17T11:54:00.000Z"
    });
  });

  it("updates completion only for the current lease token", async () => {
    await storage.saveTimelineStartJob(jobFixture({ status: "pending" }));
    const claimed = await storage.claimTimelineStartJob(claimFixture({ leaseToken: "lease-1" }));
    expect(claimed).not.toBeNull();

    const staleCompletion = await storage.updateClaimedTimelineStartJob({
      ...claimed!,
      status: "succeeded",
      timelineId: "timeline-stale",
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: "2026-05-17T12:01:00.000Z",
      updatedAt: "2026-05-17T12:01:00.000Z"
    }, "wrong-lease");

    const acceptedCompletion = await storage.updateClaimedTimelineStartJob({
      ...claimed!,
      status: "succeeded",
      timelineId: "timeline-current",
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: "2026-05-17T12:01:00.000Z",
      updatedAt: "2026-05-17T12:01:00.000Z"
    }, "lease-1");

    expect(staleCompletion).toBeNull();
    expect(acceptedCompletion).toMatchObject({
      status: "succeeded",
      timelineId: "timeline-current",
      leaseToken: null,
      leaseExpiresAt: null
    });
  });
});

function claimFixture(overrides: Partial<Parameters<MemoryStorage["claimTimelineStartJob"]>[0]> = {}) {
  return {
    id: "job-1",
    now: "2026-05-17T12:00:00.000Z",
    leaseToken: "lease-1",
    leaseExpiresAt: "2026-05-17T12:06:00.000Z",
    legacyRunningUpdatedBefore: "2026-05-17T11:54:00.000Z",
    ...overrides
  };
}

function jobFixture(overrides: Partial<TimelineStartJob> = {}): TimelineStartJob {
  return {
    id: "job-1",
    workspaceId: "workspace-1",
    gamePk: "game-1",
    status: "pending",
    timelineId: null,
    error: null,
    attempts: 0,
    leaseToken: null,
    leaseExpiresAt: null,
    createdAt: "2026-05-17T11:53:00.000Z",
    updatedAt: "2026-05-17T11:53:00.000Z",
    startedAt: null,
    completedAt: null,
    ...overrides
  };
}
