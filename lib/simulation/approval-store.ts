/**
 * Approval state machine for the human-in-the-loop workflow.
 *
 * CONTEXT.md rule: "Approval is always human. Every decision is logged."
 *
 * This module is the single source of truth for approval state.
 * It lives in memory for the demo (no Supabase until Builder A's db/ is ready).
 *
 * INTEGRATION POINT [A→B]: In production, approval records will be persisted
 * in Builder A's `action_log` / `recommendations` tables via the Repo interface.
 * Replace the in-memory Map with Repo calls once Builder A's db/ layer exists.
 *
 * State machine:
 *   PENDING → APPROVED (human approves)
 *   PENDING → REJECTED (human rejects)
 *   APPROVED → SIMULATED (simulation runs)
 *   Any state → STALE (if approval is >5 min old when simulate is called)
 *
 * Invariants enforced by this module:
 *   - Reject can NEVER lead to simulation
 *   - Simulation requires confirmed APPROVED status
 *   - Duplicate actions (approve twice, simulate twice) are idempotent-safe
 *   - Stale approvals (>5 min) are rejected at simulate time
 *   - No optimistic approval
 */

import type { ApprovalRecord, ApprovalStatus } from "./types";

/** Approvals expire 5 minutes after the human clicks Approve */
const APPROVAL_TTL_MS = 5 * 60 * 1000;

/** In-memory store (replaced by Repo in production) */
const store = new Map<string, ApprovalRecord>();

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register a new recommendation as pending approval.
 * Idempotent: calling again for the same ID does nothing if already registered.
 */
export function registerPending(recommendationId: string): ApprovalRecord {
  if (store.has(recommendationId)) {
    return store.get(recommendationId)!;
  }
  const record: ApprovalRecord = {
    recommendationId,
    status: "pending",
    createdAt: Date.now(),
  };
  store.set(recommendationId, record);
  return record;
}

// ── Approval ──────────────────────────────────────────────────────────────────

/**
 * Record a human Approve action.
 * Returns an error string if the action is invalid.
 *
 * Rules:
 *   - Only pending recommendations can be approved
 *   - Already-approved: idempotent (return existing)
 *   - Rejected or simulated: cannot be re-approved
 */
export function approve(
  recommendationId: string
): { ok: true; record: ApprovalRecord } | { ok: false; error: string } {
  const record = store.get(recommendationId);
  if (!record) {
    return { ok: false, error: `Unknown recommendation: ${recommendationId}` };
  }

  if (record.status === "approved") {
    // Idempotent — already approved
    return { ok: true, record };
  }

  if (record.status === "rejected") {
    return {
      ok: false,
      error: `Recommendation ${recommendationId} was already rejected and cannot be approved.`,
    };
  }

  if (record.status === "simulated") {
    return {
      ok: false,
      error: `Recommendation ${recommendationId} was already simulated.`,
    };
  }

  const updated: ApprovalRecord = {
    ...record,
    status: "approved",
    actionAt: Date.now(),
  };
  store.set(recommendationId, updated);
  return { ok: true, record: updated };
}

// ── Rejection ─────────────────────────────────────────────────────────────────

/**
 * Record a human Reject action.
 * Once rejected, a recommendation can NEVER be simulated.
 *
 * Rules:
 *   - Only pending recommendations can be rejected
 *   - Already-rejected: idempotent
 *   - Approved or simulated: cannot be rejected (would invalidate logged action)
 */
export function reject(
  recommendationId: string
): { ok: true; record: ApprovalRecord } | { ok: false; error: string } {
  const record = store.get(recommendationId);
  if (!record) {
    return { ok: false, error: `Unknown recommendation: ${recommendationId}` };
  }

  if (record.status === "rejected") {
    // Idempotent
    return { ok: true, record };
  }

  if (record.status === "approved") {
    return {
      ok: false,
      error: `Recommendation ${recommendationId} was already approved. Cannot reject after approval.`,
    };
  }

  if (record.status === "simulated") {
    return {
      ok: false,
      error: `Recommendation ${recommendationId} was already simulated. Cannot reject.`,
    };
  }

  const updated: ApprovalRecord = {
    ...record,
    status: "rejected",
    actionAt: Date.now(),
  };
  store.set(recommendationId, updated);
  return { ok: true, record: updated };
}

// ── Simulation gate ───────────────────────────────────────────────────────────

/**
 * Check whether simulation is allowed for a recommendation.
 * Returns the approval record if it passes all guards, or an error.
 *
 * Guards:
 *   1. Must exist and be in APPROVED status
 *   2. Approval must not be stale (>5 min old)
 *   3. Not already simulated (duplicate protection)
 *   4. Rejected plans are unconditionally blocked
 */
export function guardSimulate(
  recommendationId: string
): { ok: true; record: ApprovalRecord } | { ok: false; error: string; status?: ApprovalStatus } {
  const record = store.get(recommendationId);

  if (!record) {
    return { ok: false, error: `Unknown recommendation: ${recommendationId}` };
  }

  if (record.status === "rejected") {
    return {
      ok: false,
      error: `Recommendation ${recommendationId} was rejected. Simulation is not permitted.`,
      status: "rejected",
    };
  }

  if (record.status === "pending") {
    return {
      ok: false,
      error: `Recommendation ${recommendationId} has not been approved yet.`,
      status: "pending",
    };
  }

  if (record.status === "simulated") {
    // Duplicate protection — return already-stored result gracefully
    return {
      ok: false,
      error: `Recommendation ${recommendationId} was already simulated.`,
      status: "simulated",
    };
  }

  // Check for stale approval
  const ageMs = Date.now() - (record.actionAt ?? record.createdAt);
  if (ageMs > APPROVAL_TTL_MS) {
    const updated: ApprovalRecord = { ...record, status: "stale" };
    store.set(recommendationId, updated);
    return {
      ok: false,
      error: `Approval for ${recommendationId} has expired (>${APPROVAL_TTL_MS / 60000} min). Re-approve to simulate.`,
      status: "stale",
    };
  }

  return { ok: true, record };
}

// ── Mark simulated ────────────────────────────────────────────────────────────

/**
 * Mark an approved recommendation as simulated and store the result.
 * Must only be called after guardSimulate() returns ok: true.
 */
export function markSimulated(
  recommendationId: string,
  simulationResult: import("./types").SimulationResult
): ApprovalRecord {
  const record = store.get(recommendationId);
  if (!record) throw new Error(`Cannot mark unknown record: ${recommendationId}`);

  const updated: ApprovalRecord = {
    ...record,
    status: "simulated",
    simulatedAt: Date.now(),
    simulationResult,
  };
  store.set(recommendationId, updated);
  return updated;
}

// ── Lookup ────────────────────────────────────────────────────────────────────

/** Return the current record for a recommendation, or undefined. */
export function getRecord(recommendationId: string): ApprovalRecord | undefined {
  return store.get(recommendationId);
}

/** Restore only a server-verified, persisted human approval; never renew its TTL. */
export function restoreApproval(recommendationId: string, approvedAt: number): void {
  if (!Number.isFinite(approvedAt) || approvedAt <= 0 || approvedAt > Date.now()) {
    throw new Error('Invalid persisted approval time');
  }
  if (!store.has(recommendationId)) store.set(recommendationId, {
    recommendationId, status: 'approved', createdAt: approvedAt, actionAt: approvedAt,
  });
}

// ── Demo reset ────────────────────────────────────────────────────────────────

/**
 * Clear all approval state. Used only by demo reset / test teardown.
 * In production this would be a no-op (state lives in Builder A's tables).
 */
export function resetStore(recommendationIds?: string[]): void {
  if (recommendationIds) recommendationIds.forEach(id => store.delete(id));
  else store.clear();
}
