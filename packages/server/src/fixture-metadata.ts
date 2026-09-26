import type { CallMetadata } from "@ens402/sdk/call";
export const fixtureDefinitions = {
  hello: {
    description: "Hello World: returns a greeting as JSON after an x402 testnet payment.",
    data: { message: "Hello, world!", protocol: "x402", network: "Base Sepolia" },
  },
  weather: {
    description: "Demo fixture: Tokyo weather forecast",
    data: { city: "Tokyo", temperatureC: 24, condition: "Partly cloudy" },
  },
  fx: {
    description: "Demo fixture: USD to JPY exchange rate",
    data: { base: "USD", quote: "JPY", rate: "145.25" },
  },
  research: {
    description: "Demo fixture: concise agent payment research",
    data: {
      title: "Agent payment verification",
      summary:
        "Compare current ENS payment terms with HTTP 402 before signing.",
      sources: ["https://www.x402.org/"],
    },
  },
};
export function fixtureCall(
  service: keyof typeof fixtureDefinitions,
): CallMetadata {
  return {
    verification: "ens402.service.v1",
    method: "GET",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        fixture: { type: "boolean" },
        liveData: { type: "boolean" },
        service: { type: "string" },
      },
      required: ["fixture", "liveData", "service"],
      additionalProperties: true,
    },
    example: {},
    outputExample: {
      fixture: true,
      liveData: false,
      service,
      ...fixtureDefinitions[service].data,
    },
    fixture: true,
  };
}
