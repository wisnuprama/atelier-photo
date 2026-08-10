import { config } from "../config.js";
import { createLimiter } from "./concurrency.js";

// Process-wide cap on photos decoding/encoding at once. Holds across concurrent
// requests, not just within one, so a burst can't stack libvips working sets
// past the container's memory. Configured via config.ingestConcurrency
// (INGEST_CONCURRENCY env). Shared by every ingestion route (HMAC and session).
export const ingestLimit = createLimiter(config.ingestConcurrency);
