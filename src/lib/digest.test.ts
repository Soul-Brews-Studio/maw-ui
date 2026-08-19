import { describe, expect, test } from "bun:test";
import { parseDigest } from "./digest";

const validDigest = {
  windowLabel: "last 2h",
  source: "fleet",
  llm: "test-model",
  totalMessages: 4,
  agents: ["alpha", "beta"],
  summary: "Alpha handed work to Beta.",
  conversations: [{ pair: "alpha ↔ beta", count: 4, summary: "handoff" }],
  blocked: ["beta is waiting"],
  pendingDone: ["alpha claims done"],
  attention: ["verify alpha"],
  costs: [{ name: "alpha-oracle", cost: 1.25, tokens: 1000 }],
};

describe("parseDigest", () => {
  test("accepts the documented digest shape", () => {
    expect(parseDigest(validDigest)).toEqual(validDigest);
  });

  test.each([null, {}, { ...validDigest, agents: undefined }, { ...validDigest, costs: [{ name: "alpha", cost: "free", tokens: 0 }] }])(
    "rejects an empty or unexpected response without throwing",
    (value) => expect(parseDigest(value)).toBeNull(),
  );
});
