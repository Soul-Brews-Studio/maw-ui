/**
 * Record an event timestamp unless it predates the latest event already
 * applied for the target. Equal timestamps preserve server ordering when
 * multiple hooks are emitted in the same clock tick.
 */
export function acceptFeedEvent(
  latestByTarget: Record<string, number>,
  target: string,
  eventTs: number,
): boolean {
  const latest = latestByTarget[target];
  if (latest !== undefined && eventTs < latest) return false;
  latestByTarget[target] = eventTs;
  return true;
}
