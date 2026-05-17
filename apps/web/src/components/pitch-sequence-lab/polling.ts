import { isApiError } from "./api";

export type TimelineJobPollDecision =
  | { terminal: true; message: string; consecutiveServerFailures: number }
  | { terminal: false; message: string; retryDelayMs: number; consecutiveServerFailures: number };

export function classifyTimelineJobPollError(error: unknown, consecutiveServerFailures: number): TimelineJobPollDecision {
  if (isApiError(error)) {
    if (error.status === 401) {
      return {
        terminal: true,
        message: "Your replay session has expired. Start the replay again.",
        consecutiveServerFailures: 0
      };
    }

    if (error.status === 404) {
      if (error.code === "timeline_not_found") {
        return {
          terminal: true,
          message: "The prepared replay timeline could not be loaded. Start the replay again.",
          consecutiveServerFailures: 0
        };
      }
      return {
        terminal: true,
        message: "The replay preparation job could not be found. Start the replay again.",
        consecutiveServerFailures: 0
      };
    }

    if (error.status >= 500) {
      const nextFailures = consecutiveServerFailures + 1;
      if (nextFailures >= 3) {
        return {
          terminal: true,
          message: "The replay status service is failing repeatedly. Start the replay again in a moment.",
          consecutiveServerFailures: nextFailures
        };
      }
      return {
        terminal: false,
        message: "The replay status service had a temporary error. Retrying.",
        retryDelayMs: 3000,
        consecutiveServerFailures: nextFailures
      };
    }

    return {
      terminal: true,
      message: error.message,
      consecutiveServerFailures: 0
    };
  }

  return {
    terminal: false,
    message: "Network interrupted while checking replay status. Retrying.",
    retryDelayMs: 3000,
    consecutiveServerFailures: 0
  };
}
