import { describe, expect, test } from "bun:test";
import { wsServerError } from "./wsServerError";

describe("wsServerError", () => {
  test("surfaces the reason from a typed server error frame", () => {
    expect(wsServerError({ type: "error", error: "tmux unreachable: no server running" }))
      .toBe("tmux unreachable: no server running");
  });

  test("ignores ordinary websocket frames", () => {
    expect(wsServerError({ type: "sessions", sessions: [] })).toBeNull();
  });
});
