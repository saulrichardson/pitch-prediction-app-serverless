import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Timeline, TimelineStartJob } from "@pitch/domain";
import { memory, MemoryStorage } from "../../../../packages/db/src/storage/memory";
import { loadTimelineStartJobResult, processTimelineStartJob } from "./timeline-job-service";

const { createTimelineFromReplayMock, lambdaSendMock } = vi.hoisted(() => ({
  createTimelineFromReplayMock: vi.fn(),
  lambdaSendMock: vi.fn()
}));

vi.mock("./timeline-service", () => ({
  createTimelineFromReplay: createTimelineFromReplayMock,
  loadTimeline: vi.fn()
}));

vi.mock("./mlb-service", () => ({
  getGameReplay: vi.fn()
}));

vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: vi.fn(function LambdaClient() {
    return {
      send: lambdaSendMock
    };
  }),
  InvokeCommand: vi.fn(function InvokeCommand(input: unknown) {
    return { input };
  })
}));

const originalEnv = { ...process.env };

describe("timeline start job service", () => {
  const storage = new MemoryStorage();

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STORAGE_MODE: "memory",
      SESSION_SECRET: "test-session-secret-with-enough-length",
      TIMELINE_WORKER_LAMBDA_FUNCTION_NAME: ""
    };
    memory.timelineStartJobs.clear();
    memory.audit.length = 0;
    createTimelineFromReplayMock.mockReset();
    lambdaSendMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("does not run the model path when another worker owns an active lease", async () => {
    await storage.saveTimelineStartJob(jobFixture({
      status: "running",
      attempts: 1,
      leaseToken: "active-lease",
      leaseExpiresAt: "2999-01-01T00:00:00.000Z",
      startedAt: "2026-05-17T12:00:00.000Z"
    }));

    const job = await processTimelineStartJob("job-1");

    expect(job).toMatchObject({ status: "running", leaseToken: "active-lease" });
    expect(createTimelineFromReplayMock).not.toHaveBeenCalled();
  });

  it("claims a pending job before creating the timeline and clears the lease on success", async () => {
    await storage.saveTimelineStartJob(jobFixture({ status: "pending" }));
    createTimelineFromReplayMock.mockResolvedValue({ id: "timeline-1" } as Timeline);

    const job = await processTimelineStartJob("job-1");

    expect(createTimelineFromReplayMock).toHaveBeenCalledTimes(1);
    expect(job).toMatchObject({
      status: "succeeded",
      timelineId: "timeline-1",
      attempts: 1,
      leaseToken: null,
      leaseExpiresAt: null
    });
  });

  it("re-dispatches an expired running job from the polling read path", async () => {
    process.env.TIMELINE_WORKER_LAMBDA_FUNCTION_NAME = "web-worker";
    lambdaSendMock.mockResolvedValue({});
    await storage.saveTimelineStartJob(jobFixture({
      status: "running",
      attempts: 1,
      leaseToken: "expired-lease",
      leaseExpiresAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
      startedAt: "2000-01-01T00:00:00.000Z"
    }));

    const result = await loadTimelineStartJobResult("job-1", "workspace-1");

    expect(result.job.status).toBe("running");
    expect(lambdaSendMock).toHaveBeenCalledTimes(1);
    expect(memory.audit).toContainEqual(expect.objectContaining({
      action: "timeline_start_job.redispatched",
      workspaceId: "workspace-1"
    }));
  });
});

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
    createdAt: "2026-05-17T12:00:00.000Z",
    updatedAt: "2026-05-17T12:00:00.000Z",
    startedAt: null,
    completedAt: null,
    ...overrides
  };
}
