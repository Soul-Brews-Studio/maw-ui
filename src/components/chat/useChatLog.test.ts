import { describe, expect, test } from "bun:test";
import { feedMessageToEntries, parseRecipient } from "./useChatLog";

function sendEvent(message: string, event = "MessageSend") {
  return {
    timestamp: "2026-10-20T15:00:00+07:00",
    oracle: "somtor",
    host: "mac-tor",
    event,
    project: "somtor-oracle",
    sessionId: "s1",
    message,
    ts: 1_000,
  };
}

describe("parseRecipient", () => {
  test("skips a node prefix (maw hey <node>:<agent>)", () => {
    expect(parseRecipient("mac-tor:helm: [mac-tor:SomTor] ACK")).toEqual(["helm", "[mac-tor:SomTor] ACK"]);
  });

  test("parses a bare recipient", () => {
    expect(parseRecipient("helm: hi")).toEqual(["helm", "hi"]);
  });

  test("returns null when there is no recipient prefix", () => {
    expect(parseRecipient("hello there")).toEqual([null, "hello there"]);
  });
});

describe("feedMessageToEntries", () => {
  test("accepts a single pushed event", () => {
    const entries = feedMessageToEntries({ event: sendEvent("mac-tor:helm: [mac-tor:SomTor] ACK") });
    expect(entries).toEqual([
      { ts: "2026-10-20T15:00:00+07:00", from: "somtor", to: "helm", msg: "[mac-tor:SomTor] ACK" },
    ]);
  });

  test("accepts a batched events array", () => {
    const entries = feedMessageToEntries({ events: [sendEvent("helm: hi")] });
    expect(entries.map(e => e.to)).toEqual(["helm"]);
  });

  test("drops events that are not MessageSend", () => {
    expect(feedMessageToEntries({ event: sendEvent("helm: hi", "PreToolUse") })).toEqual([]);
  });
});
