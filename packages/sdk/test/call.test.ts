import { describe, expect, it } from "vitest";
import { parseCallMetadata, preparePostInput } from "../src/call";
import { requestNonce } from "../src/request";
const orderId = "00000000-0000-4000-8000-000000000001";
describe("public invocation metadata and bounded purchase input", () => {
  it("preserves explicit method, schema and fixture disclosure", () => {
    expect(parseCallMetadata('{"method":"POST","inputSchema":{"type":"object"},"fixture":true}')).toMatchObject({ method: "POST", fixture: true });
    expect(() => parseCallMetadata('{"method":"DELETE"}')).toThrow();
    expect(() => parseCallMetadata('{"method":"GET","fixture":"false"}')).toThrow();
    expect(() => parseCallMetadata('{"method":"GET","example":[]}')).toThrow();
    expect(() => parseCallMetadata(JSON.stringify({ method: "GET", example: { text: "x".repeat(16384) } }))).toThrow();
  });
  it("assigns the persisted attempt identity and commits to exact input bytes", () => {
    const first = preparePostInput('{"city":"Tokyo"}', orderId);
    expect(JSON.parse(first.body)).toEqual({ city: "Tokyo", orderId });
    expect(requestNonce("https://example.com/api", first)).not.toBe(requestNonce("https://example.com/api", preparePostInput('{"city":"Osaka"}', orderId)));
    expect(() => preparePostInput('["Tokyo"]', orderId)).toThrow();
    expect(() => preparePostInput('{"orderId":"other"}', orderId)).toThrow();
    expect(() => preparePostInput(JSON.stringify({ text: "猫".repeat(2800) }), orderId)).toThrow("8192 bytes");
    expect(() => preparePostInput(JSON.stringify({ text: "x".repeat(8175) }), orderId)).toThrow("bounded JSON POST");
    expect(() => preparePostInput('{}', 'not-a-uuid')).toThrow("UUID");
    expect(preparePostInput(first.body, orderId).body).toBe(first.body);
  });
});
