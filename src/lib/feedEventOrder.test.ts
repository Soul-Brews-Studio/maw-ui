import { describe, expect, test } from "bun:test";
import { acceptFeedEvent } from "./feedEventOrder";

describe("acceptFeedEvent", () => {
  test("rejects stale feed-history after a newer live busy event", () => {
    const latestByTarget: Record<string, number> = {};
    const target = "maw-ui:0";

    expect(acceptFeedEvent(latestByTarget, target, 2_000)).toBe(true);
    expect(acceptFeedEvent(latestByTarget, target, 1_000)).toBe(false);
    expect(latestByTarget[target]).toBe(2_000);
  });

  test("accepts reconnect history when no live event has been seen", () => {
    const latestByTarget: Record<string, number> = {};

    expect(acceptFeedEvent(latestByTarget, "maw-ui:0", 1_000)).toBe(true);
  });
});
