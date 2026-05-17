import crypto from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import type {
  GameReplay,
  GameSummary,
  PitchEvent,
  PredictionRequest,
  PredictionResponse,
  Timeline,
  TimelineStartJob
} from "@pitch/domain";
import { auditEvents, games, pitchEvents, plateAppearances, players, predictionRuns, timelineStartJobs, timelines } from "../schema";
import { getReadyDb } from "../client";
import { memory, MemoryStorage } from "./memory";
import { claimTimelineStartJobState, normalizeTimelineStartJob } from "./timeline-start-jobs";
import type { Storage, TimelineStartJobClaim } from "./types";

export class PostgresStorage implements Storage {
  async saveReplay(replay: GameReplay, raw?: unknown): Promise<GameReplay> {
    const db = await getReadyDb();
    if (!db) return new MemoryStorage().saveReplay(replay);
    await db
      .insert(games)
      .values({ ...gameValues(replay.game), raw: raw as never })
      .onConflictDoUpdate({
        target: games.gamePk,
        set: { ...gameValues(replay.game), raw: raw as never, updatedAt: new Date() }
      });
    const playerValues = playersFromReplay(replay);
    if (playerValues.length > 0) {
      await db
        .insert(players)
        .values(playerValues)
        .onConflictDoUpdate({
          target: players.playerId,
          set: { name: sql`excluded.name`, handedness: sql`excluded.handedness` }
        });
    }
    const paValues = plateAppearancesFromReplay(replay);
    if (paValues.length > 0) {
      await db
        .insert(plateAppearances)
        .values(paValues)
        .onConflictDoNothing();
    }
    if (replay.pitches.length > 0) {
      await db
        .insert(pitchEvents)
        .values(replay.pitches.map((pitch) => pitchEventValues(replay.game.gamePk, pitch)))
        .onConflictDoUpdate({
          target: pitchEvents.id,
          set: {
            pitchType: sql`excluded.pitch_type`,
            result: sql`excluded.result`,
            payload: sql`excluded.payload`
          }
        });
    }
    memory.replays.set(replay.game.gamePk, replay);
    return replay;
  }

  async getReplay(gamePk: string): Promise<GameReplay | null> {
    const cached = memory.replays.get(gamePk);
    if (cached) return cached;
    const db = await getReadyDb();
    if (!db) return null;
    const gameRows = await db.select().from(games).where(eq(games.gamePk, gamePk)).limit(1);
    const game = gameRows[0];
    if (!game) return null;
    const eventRows = await db.select().from(pitchEvents).where(eq(pitchEvents.gamePk, gamePk)).orderBy(asc(pitchEvents.gamePitchIndex));
    if (eventRows.length === 0) return null;
    const replay: GameReplay = {
      game: {
        gamePk: game.gamePk,
        label: game.label,
        officialDate: game.officialDate,
        awayTeam: game.awayTeam,
        homeTeam: game.homeTeam,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        status: game.status
      },
      pitches: eventRows.map((row) => row.payload as PitchEvent)
    };
    memory.replays.set(gamePk, replay);
    return replay;
  }

  async saveTimeline(timeline: Timeline): Promise<Timeline> {
    const db = await getReadyDb();
    if (!db) return new MemoryStorage().saveTimeline(timeline);
    await db
      .insert(timelines)
      .values({
        id: timeline.id,
        workspaceId: timeline.workspaceId,
        mode: timeline.mode,
        gamePk: timeline.game.gamePk,
        payload: timeline as never
      })
      .onConflictDoUpdate({
        target: timelines.id,
        set: { payload: timeline as never, updatedAt: new Date() }
      });
    memory.timelines.set(timeline.id, timeline);
    return timeline;
  }

  async getTimeline(id: string, workspaceId: string): Promise<Timeline | null> {
    const cached = memory.timelines.get(id);
    if (cached?.workspaceId === workspaceId) return cached;
    const db = await getReadyDb();
    if (!db) return null;
    const rows = await db.select().from(timelines).where(eq(timelines.id, id)).limit(1);
    const timeline = rows[0]?.payload as Timeline | undefined;
    if (!timeline || timeline.workspaceId !== workspaceId) return null;
    memory.timelines.set(id, timeline);
    return timeline;
  }

  async saveTimelineStartJob(job: TimelineStartJob): Promise<TimelineStartJob> {
    const normalized = normalizeTimelineStartJob(job);
    const db = await getReadyDb();
    if (!db) return new MemoryStorage().saveTimelineStartJob(normalized);
    await db
      .insert(timelineStartJobs)
      .values({
        id: normalized.id,
        workspaceId: normalized.workspaceId,
        gamePk: normalized.gamePk,
        status: normalized.status,
        timelineId: normalized.timelineId,
        leaseToken: normalized.leaseToken,
        leaseExpiresAt: normalized.leaseExpiresAt ? new Date(normalized.leaseExpiresAt) : null,
        payload: normalized as never
      })
      .onConflictDoUpdate({
        target: timelineStartJobs.id,
        set: {
          status: normalized.status,
          timelineId: normalized.timelineId,
          leaseToken: normalized.leaseToken,
          leaseExpiresAt: normalized.leaseExpiresAt ? new Date(normalized.leaseExpiresAt) : null,
          payload: normalized as never,
          updatedAt: new Date()
        }
      });
    memory.timelineStartJobs.set(normalized.id, normalized);
    return normalized;
  }

  async getTimelineStartJob(id: string, workspaceId?: string): Promise<TimelineStartJob | null> {
    const db = await getReadyDb();
    if (!db) return new MemoryStorage().getTimelineStartJob(id, workspaceId);
    const rows = await db.select().from(timelineStartJobs).where(eq(timelineStartJobs.id, id)).limit(1);
    const job = rows[0]?.payload ? normalizeTimelineStartJob(rows[0].payload as TimelineStartJob) : undefined;
    if (!job || (workspaceId && job.workspaceId !== workspaceId)) return null;
    memory.timelineStartJobs.set(id, job);
    return job;
  }

  async claimTimelineStartJob(claim: TimelineStartJobClaim): Promise<TimelineStartJob | null> {
    const existing = await this.getTimelineStartJob(claim.id);
    if (!existing) return null;
    const claimed = claimTimelineStartJobState(existing, claim);
    if (!claimed) return null;

    const db = await getReadyDb();
    if (!db) return new MemoryStorage().claimTimelineStartJob(claim);
    const rows = await db
      .update(timelineStartJobs)
      .set({
        status: claimed.status,
        timelineId: claimed.timelineId,
        leaseToken: claimed.leaseToken,
        leaseExpiresAt: new Date(claimed.leaseExpiresAt ?? claim.leaseExpiresAt),
        payload: claimed as never,
        updatedAt: new Date(claim.now)
      })
      .where(sql`${timelineStartJobs.id} = ${claim.id} AND (${timelineStartJobs.status} = 'pending' OR (${timelineStartJobs.status} = 'running' AND (${timelineStartJobs.leaseExpiresAt} <= ${new Date(claim.now)} OR (${timelineStartJobs.leaseExpiresAt} IS NULL AND ${timelineStartJobs.updatedAt} <= ${new Date(claim.legacyRunningUpdatedBefore)}))))`)
      .returning();

    const job = rows[0]?.payload ? normalizeTimelineStartJob(rows[0].payload as TimelineStartJob) : null;
    if (job) memory.timelineStartJobs.set(job.id, job);
    return job;
  }

  async updateClaimedTimelineStartJob(job: TimelineStartJob, leaseToken: string): Promise<TimelineStartJob | null> {
    const normalized = normalizeTimelineStartJob(job);
    const db = await getReadyDb();
    if (!db) return new MemoryStorage().updateClaimedTimelineStartJob(normalized, leaseToken);
    const rows = await db
      .update(timelineStartJobs)
      .set({
        status: normalized.status,
        timelineId: normalized.timelineId,
        leaseToken: normalized.leaseToken,
        leaseExpiresAt: normalized.leaseExpiresAt ? new Date(normalized.leaseExpiresAt) : null,
        payload: normalized as never,
        updatedAt: new Date(normalized.updatedAt)
      })
      .where(sql`${timelineStartJobs.id} = ${normalized.id} AND ${timelineStartJobs.status} = 'running' AND ${timelineStartJobs.leaseToken} = ${leaseToken}`)
      .returning();

    const saved = rows[0]?.payload ? normalizeTimelineStartJob(rows[0].payload as TimelineStartJob) : null;
    if (saved) memory.timelineStartJobs.set(saved.id, saved);
    return saved;
  }

  async savePredictionRun(run: { timelineId: string; pitchMoment: number; request: PredictionRequest; response: PredictionResponse }): Promise<void> {
    const db = await getReadyDb();
    if (!db) return new MemoryStorage().savePredictionRun(run);
    await db
      .insert(predictionRuns)
      .values({
        id: run.response.id,
        timelineId: run.timelineId,
        pitchMoment: run.pitchMoment,
        modelVersion: run.response.modelVersion,
        request: run.request as never,
        response: run.response as never
      })
      .onConflictDoUpdate({
        target: predictionRuns.id,
        set: {
          request: sql`excluded.request`,
          response: sql`excluded.response`
        }
      });
    memory.predictions.push({ ...run, createdAt: new Date().toISOString() });
  }

  async audit(event: { workspaceId?: string; timelineId?: string; action: string; payload: unknown }): Promise<void> {
    memory.audit.push({ ...event, createdAt: new Date().toISOString() });
    const db = await getReadyDb();
    if (!db) return;
    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: event.workspaceId ?? null,
      timelineId: event.timelineId ?? null,
      action: event.action,
      payload: event.payload as never
    });
  }
}

function gameValues(game: GameSummary) {
  return {
    gamePk: game.gamePk,
    label: game.label,
    officialDate: game.officialDate,
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
    awayScore: game.awayScore,
    homeScore: game.homeScore,
    status: game.status
  };
}

function playersFromReplay(replay: GameReplay) {
  const rows = new Map<string, { playerId: string; name: string; handedness: string | null }>();
  for (const pitch of replay.pitches) {
    rows.set(pitch.matchup.pitcherId, {
      playerId: pitch.matchup.pitcherId,
      name: pitch.matchup.pitcherName,
      handedness: pitch.matchup.pitcherHand
    });
    rows.set(pitch.matchup.batterId, {
      playerId: pitch.matchup.batterId,
      name: pitch.matchup.batterName,
      handedness: pitch.matchup.batterSide
    });
  }
  return Array.from(rows.values());
}

function plateAppearancesFromReplay(replay: GameReplay) {
  const rows = new Map<string, {
    id: string;
    gamePk: string;
    inning: number;
    half: string;
    pitcherId: string;
    batterId: string;
    raw: null;
  }>();
  for (const pitch of replay.pitches) {
    rows.set(pitch.paId, {
      id: pitch.paId,
      gamePk: replay.game.gamePk,
      inning: pitch.preState.inning,
      half: pitch.preState.half,
      pitcherId: pitch.matchup.pitcherId,
      batterId: pitch.matchup.batterId,
      raw: null
    });
  }
  return Array.from(rows.values());
}

function pitchEventValues(gamePk: string, pitch: PitchEvent) {
  return {
    id: pitch.id,
    gamePk,
    paId: pitch.paId,
    gamePitchIndex: pitch.gamePitchIndex,
    source: pitch.source,
    pitchType: pitch.pitchType,
    result: pitch.result,
    payload: pitch as never
  };
}
