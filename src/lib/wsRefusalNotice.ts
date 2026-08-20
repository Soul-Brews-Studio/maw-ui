import { OPEN_MODE } from "./api";

export interface RefusalNotice {
  title: string;
  detail: string;
}

/**
 * Explain a WebSocket the backend refused outright.
 *
 * Why this exists: maw-rs >= v26.8.18 requires every Origin-bearing `/ws`
 * upgrade to carry a one-use ticket, and browsers always send Origin. Against
 * such a backend a build with no operator gate can never obtain a ticket, so
 * every upgrade is rejected — while HTTP keeps working. The UI therefore looked
 * completely healthy (LIVE badge, agent counts, working PTY terminals) and just
 * sat at zero agents forever, with nothing on screen naming the cause. That
 * cost a full debugging session on 2026-08-20; this turns it into one sentence.
 *
 * Only call when the socket has never opened AND HTTP is healthy — a host that
 * is simply unreachable fails both, and the stale-data banner already covers it.
 */
export function wsRefusalNotice(openMode: boolean = OPEN_MODE): RefusalNotice {
  if (openMode) {
    return {
      title: "Backend refuses this build's live connection",
      detail:
        "HTTP works, but the backend rejects every WebSocket upgrade. This build ships " +
        "without operator auth, so it cannot obtain the one-use ticket maw serve requires " +
        "(maw-rs v26.8.18+). Fix: run maw serve with a token and use the gated build, or " +
        "downgrade maw serve below v26.8.18.",
    };
  }
  return {
    title: "Live connection refused",
    detail:
      "HTTP works, but the backend rejected the WebSocket upgrade. The operator " +
      "credential is likely missing or stale for this host — re-authenticate, or check " +
      "that maw serve was started with a token.",
  };
}
