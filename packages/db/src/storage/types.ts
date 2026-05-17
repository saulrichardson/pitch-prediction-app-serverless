import type {
  GameReplay,
  PredictionRequest,
  PredictionResponse,
  Timeline,
  TimelineStartJob
} from "@pitch/domain";

export type TimelineStartJobClaim = {
  id: string;
  now: string;
  leaseToken: string;
  leaseExpiresAt: string;
  legacyRunningUpdatedBefore: string;
};

export interface Storage {
  saveReplay(replay: GameReplay, raw?: unknown): Promise<GameReplay>;
  getReplay(gamePk: string): Promise<GameReplay | null>;
  saveTimeline(timeline: Timeline): Promise<Timeline>;
  getTimeline(id: string, workspaceId: string): Promise<Timeline | null>;
  saveTimelineStartJob(job: TimelineStartJob): Promise<TimelineStartJob>;
  getTimelineStartJob(id: string, workspaceId?: string): Promise<TimelineStartJob | null>;
  claimTimelineStartJob(claim: TimelineStartJobClaim): Promise<TimelineStartJob | null>;
  updateClaimedTimelineStartJob(job: TimelineStartJob, leaseToken: string): Promise<TimelineStartJob | null>;
  savePredictionRun(run: {
    timelineId: string;
    pitchMoment: number;
    request: PredictionRequest;
    response: PredictionResponse;
  }): Promise<void>;
  audit(event: { workspaceId?: string; timelineId?: string; action: string; payload: unknown }): Promise<void>;
}
