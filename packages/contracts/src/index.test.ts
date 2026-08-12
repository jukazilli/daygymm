import { describe, expect, it } from "vitest";

import { toOpaqueId } from "./index.js";

describe("opaque identifiers", () => {
  it("normalizes the transport representation", () => {
    expect(toOpaqueId("  synthetic-id  ")).toBe("synthetic-id");
  });

  it("does not permit empty identifiers", () => {
    expect(() => toOpaqueId("  ")).toThrow("cannot be empty");
  });
});
