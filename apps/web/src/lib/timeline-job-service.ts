import crypto from "node:crypto";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import type { Timeline, TimelineStartJob, TimelineStartJobError } from "@pitch/domain";
import { getStorage } from "@pitch/db";
import { getGameReplay } from "./mlb-service";
import { createTimelineFromReplay, loadTimeline } from "./timeline-service";
import { appSecretConfig } from "./env";
import { HttpError, notFound, serviceUnavailable, unauthorized } from "./http";

const lambdaClient = new LambdaClient({});
const staleRunningJobMs = 6 * 60 * 1000;
const timelineStartJobLeaseMs = 6 * 60 * 1000;

export type TimelineStartJobResult = {
  job: TimelineStartJob;
  timeline?: Timeline;
};

export async function createTimelineStartJob(workspaceId: string, gamePk: string): Promise<TimelineStartJob> {
  const now = new Date().toISOString();
  const job: TimelineStartJob = {
    id: `timeline_job_${crypto.randomUUID()}`,
    workspaceId,
    gamePk,
    status: "pending",
    timelineId: null,
    error: null,
    attempts: 0,
    leaseToken: null,
    leaseExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null
  };

  const storage = getStorage();
  await storage.saveTimelineStartJob(job);
  await storage.audit({ workspaceId, action: "timeline_start_job.created", payload: { jobId: job.id, gamePk } });

  try {
    await dispatchTimelineStartJob(job.id);
    return job;
  } catch (error) {
    const failed = failJob(job, serializeJobError(error));
    await storage.saveTimelineStartJob(failed);
    await storage.audit({
      workspaceId,
      action: "timeline_start_job.dispatch_failed",
      payload: { jobId: job.id, gamePk, error: failed.error }
    });
    throw error;
  }
}

export async function loadTimelineStartJobResult(id: string, workspaceId: string): Promise<TimelineStartJobResult> {
  const storage = getStorage();
  const job = await storage.getTimelineStartJob(id, workspaceId);
  if (!job) throw notFound("Timeline start job not found.", "timeline_start_job_not_found");
  if (job.status === "running" && isExpiredRunningJobLease(job)) {
    await dispatchTimelineStartJob(job.id);
    await storage.audit({
      workspaceId: job.workspaceId,
      action: "timeline_start_job.redispatched",
      payload: { jobId: job.id, gamePk: job.gamePk, attempts: job.attempts }
    });
  }
  if (job.status !== "succeeded" || !job.timelineId) return { job };
  return { job, timeline: await loadTimeline(job.timelineId, workspaceId) };
}

export async function processTimelineStartJob(id: string): Promise<TimelineStartJob> {
  const storage = getStorage();
  const claim = timelineStartJobClaim(id);
  const claimed = await storage.claimTimelineStartJob(claim);
  if (!claimed) {
    const existing = await storage.getTimelineStartJob(id);
    if (!existing) throw notFound("Timeline start job not found.", "timeline_start_job_not_found");
    return existing;
  }

  let job: TimelineStartJob = claimed;
  await storage.audit({
    workspaceId: job.workspaceId,
    action: "timeline_start_job.running",
    payload: { jobId: job.id, gamePk: job.gamePk, attempts: job.attempts }
  });

  try {
    const timeline = await createTimelineFromReplay(
      job.workspaceId,
      job.gamePk,
      () => getGameReplay(job.gamePk),
      { predictionTimeoutMs: backgroundModelRequestTimeoutMs() }
    );
    job = {
      ...job,
      status: "succeeded",
      timelineId: timeline.id,
      leaseToken: null,
      leaseExpiresAt: null,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const saved = await storage.updateClaimedTimelineStartJob(job, claim.leaseToken);
    if (!saved) return await loadCurrentTimelineStartJob(job.id, job);
    job = saved;
    await storage.audit({
      workspaceId: job.workspaceId,
      timelineId: timeline.id,
      action: "timeline_start_job.succeeded",
      payload: { jobId: job.id, gamePk: job.gamePk }
    });
    return job;
  } catch (error) {
    const failed = failJob(job, serializeJobError(error));
    const saved = await storage.updateClaimedTimelineStartJob(failed, claim.leaseToken);
    if (!saved) return await loadCurrentTimelineStartJob(job.id, failed);
    await storage.audit({
      workspaceId: saved.workspaceId,
      action: "timeline_start_job.failed",
      payload: { jobId: saved.id, gamePk: saved.gamePk, error: saved.error }
    });
    return saved;
  }
}

export function assertInternalTimelineWorkerSecret(headerValue: string | null) {
  const expected = internalWorkerSecret();
  if (!headerValue || !timingSafeEqual(headerValue, expected)) {
    throw unauthorized("Timeline worker route requires an internal worker secret.", "timeline_worker_unauthorized");
  }
}

function failJob(job: TimelineStartJob, error: TimelineStartJobError): TimelineStartJob {
  return {
    ...job,
    status: "failed",
    error,
    leaseToken: null,
    leaseExpiresAt: null,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function timelineStartJobClaim(id: string) {
  const nowMs = Date.now();
  return {
    id,
    now: new Date(nowMs).toISOString(),
    leaseToken: crypto.randomUUID(),
    leaseExpiresAt: new Date(nowMs + timelineStartJobLeaseMs).toISOString(),
    legacyRunningUpdatedBefore: new Date(nowMs - staleRunningJobMs).toISOString()
  };
}

async function loadCurrentTimelineStartJob(id: string, fallback: TimelineStartJob): Promise<TimelineStartJob> {
  return await getStorage().getTimelineStartJob(id) ?? fallback;
}

async function dispatchTimelineStartJob(jobId: string) {
  const functionName = process.env.TIMELINE_WORKER_LAMBDA_FUNCTION_NAME;
  if (!functionName) {
    void processTimelineStartJob(jobId).catch((error) => {
      console.error(JSON.stringify({ level: "error", message: "Local timeline start job failed.", error: serializeJobError(error), jobId }));
    });
    return;
  }

  await lambdaClient.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: "Event",
    Payload: Buffer.from(JSON.stringify(timelineWorkerEvent(jobId, internalWorkerSecret())))
  }));
}

function timelineWorkerEvent(jobId: string, secret: string) {
  const path = `/api/timeline-jobs/${encodeURIComponent(jobId)}/run`;
  const now = new Date();
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: "",
    cookies: [],
    headers: {
      "content-type": "application/json",
      host: "timeline-worker.internal",
      "user-agent": "timeline-start-worker",
      "x-internal-worker-secret": secret
    },
    requestContext: {
      accountId: "internal",
      apiId: "internal",
      domainName: "timeline-worker.internal",
      domainPrefix: "timeline-worker",
      http: {
        method: "POST",
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "timeline-start-worker"
      },
      requestId: crypto.randomUUID(),
      routeKey: "$default",
      stage: "$default",
      time: now.toISOString(),
      timeEpoch: now.getTime()
    },
    body: "{}",
    isBase64Encoded: false
  };
}

function backgroundModelRequestTimeoutMs() {
  const raw = process.env.BACKGROUND_MODEL_REQUEST_TIMEOUT_MS ?? "290000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("BACKGROUND_MODEL_REQUEST_TIMEOUT_MS must be a positive number of milliseconds.");
  }
  return Math.min(Math.round(parsed), 295000);
}

function internalWorkerSecret() {
  const sessionSecret = appSecretConfig().sessionSecret;
  if (!sessionSecret) {
    throw serviceUnavailable("Timeline worker secret is not configured.", "timeline_worker_not_configured");
  }
  return crypto.createHmac("sha256", sessionSecret).update("timeline-start-worker").digest("hex");
}

function serializeJobError(error: unknown): TimelineStartJobError {
  if (error instanceof HttpError) return { message: error.message, code: error.code };
  if (error instanceof Error) return { message: error.message, code: "timeline_start_failed" };
  return { message: String(error), code: "timeline_start_failed" };
}

function isExpiredRunningJobLease(job: TimelineStartJob) {
  const leaseExpiresAt = job.leaseExpiresAt ? Date.parse(job.leaseExpiresAt) : Number.NaN;
  if (!Number.isNaN(leaseExpiresAt)) return Date.now() >= leaseExpiresAt;
  const updatedAt = Date.parse(job.updatedAt);
  return Number.isNaN(updatedAt) || Date.now() - updatedAt > staleRunningJobMs;
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
