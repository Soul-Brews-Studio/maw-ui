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
      title: "This backend requires an operator token",
      detail:
        "HTTP works, but the backend rejects every WebSocket upgrade — maw-rs v26.8.18+ " +
        "requires a one-use ticket, which needs a credential. Enter your operator token " +
        "below to connect. (Alternatively: run maw serve below v26.8.18, which does not " +
        "require one.)",
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
