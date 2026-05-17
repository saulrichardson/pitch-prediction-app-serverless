import type {
  GameReplay,
  PredictionRequest,
  PredictionResponse,
  Timeline,
  TimelineStartJob
} from "@pitch/domain";
import { claimTimelineStartJobState, normalizeTimelineStartJob } from "./timeline-start-jobs";
import type { Storage, TimelineStartJobClaim } from "./types";

export const memory = {
  replays: new Map<string, GameReplay>(),
  timelines: new Map<string, Timeline>(),
  timelineStartJobs: new Map<string, TimelineStartJob>(),
  predictions: [] as unknown[],
  audit: [] as unknown[]
};

export class MemoryStorage implements Storage {
  async saveReplay(replay: GameReplay): Promise<GameReplay> {
    memory.replays.set(replay.game.gamePk, replay);
    return replay;
  }

  async getReplay(gamePk: string): Promise<GameReplay | null> {
    return memory.replays.get(gamePk) ?? null;
  }

  async saveTimeline(timeline: Timeline): Promise<Timeline> {
    memory.timelines.set(timeline.id, timeline);
    return timeline;
  }

  async getTimeline(id: string, workspaceId: string): Promise<Timeline | null> {
    const timeline = memory.timelines.get(id);
    return timeline?.workspaceId === workspaceId ? timeline : null;
  }

  async saveTimelineStartJob(job: TimelineStartJob): Promise<TimelineStartJob> {
    const normalized = normalizeTimelineStartJob(job);
    memory.timelineStartJobs.set(job.id, normalized);
    return normalized;
  }

  async getTimelineStartJob(id: string, workspaceId?: string): Promise<TimelineStartJob | null> {
    const job = memory.timelineStartJobs.get(id);
    if (!job) return null;
    if (workspaceId && job.workspaceId !== workspaceId) return null;
    return normalizeTimelineStartJob(job);
  }

  async claimTimelineStartJob(claim: TimelineStartJobClaim): Promise<TimelineStartJob | null> {
    const job = memory.timelineStartJobs.get(claim.id);
    if (!job) return null;
    const claimed = claimTimelineStartJobState(job, claim);
    if (!claimed) return null;
    memory.timelineStartJobs.set(claim.id, claimed);
    return claimed;
  }

  async updateClaimedTimelineStartJob(job: TimelineStartJob, leaseToken: string): Promise<TimelineStartJob | null> {
    const current = memory.timelineStartJobs.get(job.id);
    if (!current || current.status !== "running" || current.leaseToken !== leaseToken) return null;
    const normalized = normalizeTimelineStartJob(job);
    memory.timelineStartJobs.set(job.id, normalized);
    return normalized;
  }

  async savePredictionRun(run: { timelineId: string; pitchMoment: number; request: PredictionRequest; response: PredictionResponse }): Promise<void> {
    memory.predictions.push({ ...run, createdAt: new Date().toISOString() });
  }

  async audit(event: { workspaceId?: string; timelineId?: string; action: string; payload: unknown }): Promise<void> {
    memory.audit.push({ ...event, createdAt: new Date().toISOString() });
  }
}
