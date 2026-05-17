import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { classifyTimelineJobPollError } from "./polling";

describe("timeline job polling error classification", () => {
  it("treats missing jobs as terminal instead of another warmup retry", () => {
    expect(classifyTimelineJobPollError(
      new ApiError(404, "Timeline start job not found.", "timeline_start_job_not_found"),
      0
    )).toEqual({
      terminal: true,
      message: "The replay preparation job could not be found. Start the replay again.",
      consecutiveServerFailures: 0
    });
  });

  it("treats expired sessions as terminal", () => {
    expect(classifyTimelineJobPollError(
      new ApiError(401, "Unauthorized.", "unauthorized"),
      0
    )).toEqual({
      terminal: true,
      message: "Your replay session has expired. Start the replay again.",
      consecutiveServerFailures: 0
    });
  });

  it("treats missing succeeded timelines as terminal", () => {
    expect(classifyTimelineJobPollError(
      new ApiError(404, "Timeline not found.", "timeline_not_found"),
      0
    )).toEqual({
      terminal: true,
      message: "The prepared replay timeline could not be loaded. Start the replay again.",
      consecutiveServerFailures: 0
    });
  });

  it("allows one-off server failures but stops after repeated 5xx responses", () => {
    const first = classifyTimelineJobPollError(new ApiError(503, "Unavailable.", "service_unavailable"), 0);
    const third = classifyTimelineJobPollError(new ApiError(500, "Unexpected.", "unexpected_server_error"), 2);

    expect(first).toEqual({
      terminal: false,
      message: "The replay status service had a temporary error. Retrying.",
      retryDelayMs: 3000,
      consecutiveServerFailures: 1
    });
    expect(third).toEqual({
      terminal: true,
      message: "The replay status service is failing repeatedly. Start the replay again in a moment.",
      consecutiveServerFailures: 3
    });
  });
});
