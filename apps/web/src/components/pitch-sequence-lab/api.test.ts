import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getJson } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pitch lab API helper", () => {
  it("exposes HTTP status and stable error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "Timeline start job not found.",
      code: "timeline_start_job_not_found"
    }), { status: 404 })));

    await expect(getJson("/api/timeline-jobs/missing")).rejects.toMatchObject({
      status: 404,
      code: "timeline_start_job_not_found",
      message: "Timeline start job not found."
    } satisfies Partial<ApiError>);
  });
});
