export type PitchType = "FF" | "SI" | "SL" | "CH" | "CU" | "FC" | "FS" | "Other";

export type PitchResult =
  | "ball"
  | "called_strike"
  | "whiff"
  | "foul"
  | "ball_in_play"
  | "hit_by_pitch";

export type TimelinePitchSource = "actual";

export type TerminalState = "strikeout" | "walk" | "hit_by_pitch" | "ball_in_play";

export type RevealLabel = "Expected" | "Plausible" | "Surprising" | "Very Surprising";

export type BaseState = {
  first: boolean;
  second: boolean;
  third: boolean;
};

export type CountState = {
  balls: 0 | 1 | 2 | 3;
  strikes: 0 | 1 | 2;
};

export type LiveOutCount = 0 | 1 | 2;
export type OutCount = LiveOutCount | 3;

export type GameState = {
  inning: number;
  half: "top" | "bottom";
  count: CountState;
  outs: OutCount;
  bases: BaseState;
  awayScore: number;
  homeScore: number;
};

export type Matchup = {
  pitcherId: string;
  pitcherName: string;
  pitcherHand: "L" | "R" | "S" | "Unknown";
  batterId: string;
  batterName: string;
  batterSide: "L" | "R" | "S" | "Unknown";
};

export type StrikeZoneSource = "measured" | "estimated" | "default";

export type StrikeZoneBounds = {
  top: number;
  bottom: number;
  width: number | null;
  depth: number | null;
  source: StrikeZoneSource;
};

export type PitchLocation = {
  px: number | null;
  pz: number | null;
  zone: number | null;
  label: LocationBucket;
  strikeZone?: StrikeZoneBounds | null;
};

export type LocationBucket =
  | "Up In"
  | "Up Middle"
  | "Up Away"
  | "Middle In"
  | "Middle"
  | "Middle Away"
  | "Low In"
  | "Low Middle"
  | "Low Away"
  | "Chase Low"
  | "Chase Away"
  | "Waste";

export type PitchShape = {
  velocity: number | null;
  spin: number | null;
  release: Record<string, number | null>;
  movement: Record<string, number | null>;
};

export type PitchEvent = {
  id: string;
  paId: string;
  pitchNumber: number;
  gamePitchIndex: number;
  source: TimelinePitchSource;
  pitchType: PitchType;
  result: PitchResult;
  location: PitchLocation;
  shape: PitchShape;
  preState: GameState;
  postState: GameState;
  matchup: Matchup;
  description: string;
};

export type PitchMoment = Pick<
  PitchEvent,
  "id" | "paId" | "pitchNumber" | "gamePitchIndex" | "source" | "preState" | "matchup"
>;

export type GameSummary = {
  gamePk: string;
  label: string;
  officialDate: string;
  awayTeam: string;
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  status: string;
};

export type GameReplay = {
  game: GameSummary;
  pitches: PitchEvent[];
};

export type Probability = {
  label: string;
  probability: number;
};

export type PossiblePitch = {
  pitchType: PitchType;
  velocity: number;
  location: PitchLocation;
  result: PitchResult;
  description: string;
};

export type PredictionRequest = {
  pitcherId: string;
  batterId: string;
  pitcherHand: Matchup["pitcherHand"];
  batterSide: Matchup["batterSide"];
  gameDate: string;
  count: CountState;
  outs: LiveOutCount;
  bases: BaseState;
  score: { away: number; home: number };
  inning: number;
  half: GameState["half"];
  pitchNumber: number;
  timesThroughOrder: number;
  strikeZone: { top: number; bottom: number };
  pitcherSessionHistory: PitchEvent[];
  currentPaHistory: PitchEvent[];
};

export type PredictionResponse = {
  id: string;
  modelVersion: string;
  pitchMix: Probability[];
  resultMix: Probability[];
  location: {
    density: Probability[];
    expected: PitchLocation;
  };
  countImpact: Probability[];
  paForecast: Probability[];
  expectedPitchesRemaining: number;
  possiblePitches: PossiblePitch[];
  createdAt: string;
};

export type PitchEvaluation = {
  pitchTypeRank: number | null;
  pitchTypeProbability: number;
  resultProbability: number;
  topPitchType: string | null;
  topPitchProbability: number;
  locationErrorFeet: number | null;
  velocityErrorMph: number | null;
  label: RevealLabel;
};

export type ActualPitchForecast = {
  pitchId: string;
  pitchIndex: number;
  prediction: PredictionResponse;
  evaluation: PitchEvaluation;
};

export type Timeline = {
  id: string;
  workspaceId: string;
  mode: "real-game";
  game: GameSummary;
  actualPitches: PitchEvent[];
  currentPitchIndex: number;
  actualHistory: PitchEvent[];
  actualForecastHistory: ActualPitchForecast[];
  actualPrediction: PredictionResponse;
  actualRevealed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClientTimeline = Omit<Timeline, "actualPitches"> & {
  currentPitch: PitchMoment | null;
  nextPitchContext: PitchMoment | null;
  actualPitchCount: number;
};

export type TimelineStartJobStatus = "pending" | "running" | "succeeded" | "failed";

export type TimelineStartJobError = {
  message: string;
  code: string;
};

export type TimelineStartJob = {
  id: string;
  workspaceId: string;
  gamePk: string;
  status: TimelineStartJobStatus;
  timelineId: string | null;
  error: TimelineStartJobError | null;
  attempts: number;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type ClientTimelineStartJob = Omit<TimelineStartJob, "workspaceId" | "leaseToken" | "leaseExpiresAt">;
