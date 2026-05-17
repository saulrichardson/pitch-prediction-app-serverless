import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const games = pgTable(
  "games",
  {
    gamePk: text("game_pk").primaryKey(),
    label: text("label").notNull(),
    officialDate: text("official_date").notNull(),
    awayTeam: text("away_team").notNull(),
    homeTeam: text("home_team").notNull(),
    awayScore: integer("away_score").notNull().default(0),
    homeScore: integer("home_score").notNull().default(0),
    status: text("status").notNull(),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    officialDateIdx: index("games_official_date_idx").on(table.officialDate)
  })
);

export const players = pgTable(
  "players",
  {
    playerId: text("player_id").primaryKey(),
    name: text("name").notNull(),
    handedness: text("handedness"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    nameIdx: index("players_name_idx").on(table.name)
  })
);

export const plateAppearances = pgTable("plate_appearances", {
  id: text("id").primaryKey(),
  gamePk: text("game_pk").references(() => games.gamePk),
  inning: integer("inning").notNull(),
  half: text("half").notNull(),
  pitcherId: text("pitcher_id"),
  batterId: text("batter_id"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const pitchEvents = pgTable(
  "pitch_events",
  {
    id: text("id").primaryKey(),
    gamePk: text("game_pk").references(() => games.gamePk),
    paId: text("pa_id").references(() => plateAppearances.id),
    gamePitchIndex: integer("game_pitch_index").notNull(),
    source: text("source").notNull(),
    pitchType: text("pitch_type").notNull(),
    result: text("result").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    gamePitchIdx: uniqueIndex("pitch_events_game_pitch_idx").on(table.gamePk, table.gamePitchIndex),
    paIdx: index("pitch_events_pa_idx").on(table.paId)
  })
);

export const predictionRuns = pgTable(
  "prediction_runs",
  {
    id: text("id").primaryKey(),
    timelineId: text("timeline_id").notNull(),
    pitchMoment: integer("pitch_moment").notNull(),
    modelVersion: text("model_version").notNull(),
    request: jsonb("request").notNull(),
    response: jsonb("response").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    timelineIdx: index("prediction_runs_timeline_idx").on(table.timelineId)
  })
);

export const timelines = pgTable(
  "timelines",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    mode: text("mode").notNull(),
    gamePk: text("game_pk"),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull()
  },
  (table) => ({
    workspaceIdx: index("timelines_workspace_idx").on(table.workspaceId)
  })
);

export const timelineStartJobs = pgTable(
  "timeline_start_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    gamePk: text("game_pk").notNull(),
    status: text("status").notNull(),
    timelineId: text("timeline_id"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`).notNull()
  },
  (table) => ({
    workspaceIdx: index("timeline_start_jobs_workspace_idx").on(table.workspaceId),
    statusIdx: index("timeline_start_jobs_status_idx").on(table.status)
  })
);

export const branchPitchEvents = pgTable(
  // Legacy SQL durable-mode table retained until a deliberate drop migration is approved.
  "branch_pitch_events",
  {
    id: text("id").primaryKey(),
    timelineId: text("timeline_id").notNull(),
    branchId: text("branch_id").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    branchIdx: index("branch_pitch_events_branch_idx").on(table.timelineId, table.branchId)
  })
);

export const manualSituations = pgTable(
  // Legacy SQL durable-mode table retained until a deliberate drop migration is approved.
  "manual_situations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    workspaceIdx: index("manual_situations_workspace_idx").on(table.workspaceId)
  })
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    timelineId: text("timeline_id"),
    action: text("action").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    timelineIdx: index("audit_events_timeline_idx").on(table.timelineId),
    actionIdx: index("audit_events_action_idx").on(table.action)
  })
);
