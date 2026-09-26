import { expect, it } from "vitest";
import { serviceLabelError } from "../src/components/registration-validation";
it("accepts the registrar's label boundary and internal hyphens", () => {
  for (const name of ["abc", "weather-v2", "a".repeat(32)])
    expect(serviceLabelError(name)).toBeNull();
});
it("explains actionable corrections rather than a generic attention status", () => {
  expect(serviceLabelError("ab")).toContain("3 to 32");
  expect(serviceLabelError("Weather")).toContain("lowercase");
  expect(serviceLabelError("weather.demo.eth")).toContain("suffix");
  expect(serviceLabelError("weather ")).toContain("spaces");
  expect(serviceLabelError("-weather")).toContain("start and end");
  expect(serviceLabelError("天氣服務")).toContain("a-z");
  expect(serviceLabelError("")).toContain("Enter a service name");
});
