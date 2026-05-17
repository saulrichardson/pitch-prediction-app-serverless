import { gone } from "../../../lib/http";

export async function POST() {
  return gone("Synchronous timeline creation has been retired. Use /api/timeline-jobs.", "timeline_sync_start_deprecated");
}
