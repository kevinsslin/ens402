import { describe, expect, it } from "vitest";
import type { PaymentRequired } from "@x402/core/types";
import {
  canonicalMetadata,
  metadataExtension,
  parseChallengeMetadata,
  verifyChallengeMetadata,
} from "../src/metadata";
import type { CallMetadata } from "../src/call";

const call: CallMetadata = {
  verification: "ens402.service.v1",
  method: "GET",
  inputSchema: { type: "object", properties: {} },
  outputSchema: {
    type: "object",
    properties: { temperature: { type: "number" } },
  },
};
const description = "Weather forecast";
const challenge = (): PaymentRequired => ({
  x402Version: 2,
  resource: { url: "https://weather.example/", description },
  accepts: [],
  extensions: metadataExtension(description, call),
});
describe("verified endpoint metadata", () => {
  it("canonicalizes object key order without changing array semantics", () => {
    expect(
      canonicalMetadata(description, {
        ...call,
        inputSchema: { properties: {}, type: "object" },
      }).hash,
    ).toBe(canonicalMetadata(description, call).hash);
    expect(
      canonicalMetadata(description, {
        ...call,
        outputSchema: { required: ["a", "b"] },
      }).hash,
    ).not.toBe(
      canonicalMetadata(description, {
        ...call,
        outputSchema: { required: ["b", "a"] },
      }).hash,
    );
    expect(parseChallengeMetadata(challenge()).hash).toBe(
      canonicalMetadata(description, call).hash,
    );
  });
  it.each(["description", "method", "input", "output"])(
    "rejects %s drift",
    (field) => {
      const value = challenge();
      if (field === "description")
        value.resource.description = "Changed forecast";
      else
        value.extensions = metadataExtension(description, {
          ...call,
          ...(field === "method"
            ? { method: "POST" }
            : field === "input"
              ? { inputSchema: { type: "object", required: ["city"] } }
              : { outputSchema: { type: "string" } }),
        });
      expect(() =>
        verifyChallengeMetadata({ description, call }, value, "GET"),
      ).toThrow("does not match");
    },
  );
  it("rejects unsupported or missing metadata and schemas", () => {
    expect(() =>
      parseChallengeMetadata({ ...challenge(), extensions: {} }),
    ).toThrow("missing or unsupported");
    expect(() =>
      parseChallengeMetadata({
        ...challenge(),
        extensions: { "ens402.service": { version: 2, call } },
      }),
    ).toThrow("missing or unsupported");
    expect(() =>
      canonicalMetadata(description, { ...call, outputSchema: undefined }),
    ).toThrow("requires input and output");
    expect(() =>
      canonicalMetadata(description, {
        ...call,
        inputSchema: { properties: { city: { $ref: "#/definitions/city" } } },
      }),
    ).toThrow("references are unsupported");
  });
  it("keeps legacy explicit and prevents downgrading an approved verification hash", () => {
    expect(verifyChallengeMetadata({}, challenge(), "GET")).toEqual({
      status: "legacy-unverified",
    });
    expect(() =>
      verifyChallengeMetadata(
        {},
        challenge(),
        "GET",
        canonicalMetadata(description, call).hash,
      ),
    ).toThrow("was removed");
    expect(() =>
      verifyChallengeMetadata({ description, call }, challenge(), "GET", "old"),
    ).toThrow("does not match");
  });
});
