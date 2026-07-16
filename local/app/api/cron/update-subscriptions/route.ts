import { NextRequest } from "next/server";
import { json } from "@local/lib/http";
import { requireLocalCronAuth } from "@local/lib/cron-auth";
import { runLocalSubscriptionAutoUpdateCron } from "@local/lib/auto-update-service";
import {
  acquireLocalJobLease,
  JobLeaseLostError,
  releaseLocalJobLease,
  startLocalJobLeaseHeartbeat,
  type LocalJobLease,
} from "@local/lib/job-lease";

const LEASE_NAME = "local-subscription-auto-update";
const LEASE_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

export async function POST(request: NextRequest) {
  const authError = requireLocalCronAuth(request);
  if (authError) return authError;

  let lease: LocalJobLease | null = null;
  let heartbeat: ReturnType<typeof startLocalJobLeaseHeartbeat> | null = null;
  try {
    lease = await acquireLocalJobLease({ name: LEASE_NAME, leaseMs: LEASE_MS });
    if (!lease) return json({ success: true, skipped: true, reason: "already_running" });

    heartbeat = startLocalJobLeaseHeartbeat({ lease, leaseMs: LEASE_MS, intervalMs: HEARTBEAT_MS });
    const summary = await runLocalSubscriptionAutoUpdateCron(new Date(), {
      assertLease: heartbeat.assertOwned,
    });
    return json({
      success: true,
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof JobLeaseLostError) {
      return json({ error: "Local subscription update lease lost.", code: "JOB_LEASE_LOST" }, 503);
    }
    throw error;
  } finally {
    await heartbeat?.stop();
    if (lease) await releaseLocalJobLease(lease).catch(() => undefined);
  }
}
