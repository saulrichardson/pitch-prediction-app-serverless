import type { TimelineStartJob } from "@pitch/domain";
import type { TimelineStartJobClaim } from "./types";

export function normalizeTimelineStartJob(job: TimelineStartJob): TimelineStartJob {
  return {
    ...job,
    leaseToken: job.leaseToken ?? null,
    leaseExpiresAt: job.leaseExpiresAt ?? null
  };
}

export function claimTimelineStartJobState(job: TimelineStartJob, claim: TimelineStartJobClaim): TimelineStartJob | null {
  const current = normalizeTimelineStartJob(job);
  if (!canClaimTimelineStartJob(current, claim)) return null;
  return {
    ...current,
    status: "running",
    error: null,
    attempts: current.attempts + 1,
    leaseToken: claim.leaseToken,
    leaseExpiresAt: claim.leaseExpiresAt,
    startedAt: current.startedAt ?? claim.now,
    completedAt: null,
    updatedAt: claim.now
  };
}

export function canClaimTimelineStartJob(job: TimelineStartJob, claim: TimelineStartJobClaim): boolean {
  if (job.status === "pending") return true;
  if (job.status !== "running") return false;
  if (job.leaseExpiresAt) return job.leaseExpiresAt <= claim.now;
  return job.updatedAt <= claim.legacyRunningUpdatedBefore;
}
