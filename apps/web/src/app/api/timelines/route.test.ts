import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("legacy timeline creation route", () => {
  it("returns 410 so public callers use async timeline jobs", async () => {
    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).toEqual({
      error: "Synchronous timeline creation has been retired. Use /api/timeline-jobs.",
      code: "timeline_sync_start_deprecated"
    });
  });
});
