import type { CallMetadata } from "@ens402/sdk/call";
export const fixtureDefinitions = {
  hello: {
    description: "Hello World: returns a greeting as JSON after an x402 testnet payment.",
    data: { message: "Hello, world!", protocol: "x402", network: "Base Sepolia" },
  },
  "bounty-info": {
    description: "Demo fixture: ETHGlobal bounty information. Find hackathon sponsor prizes, bounty requirements, eligibility, submission checklists and official resources for builders. Sample data, not an official prize listing.",
    data: {
      title: "ETHGlobal bounty information",
      event: "ETHGlobal demo",
      notice: "Illustrative bounties only. Sponsors, rewards and requirements below are demo examples, not official offers. Check the official event page before submitting.",
      officialUrl: "https://ethglobal.com/events",
      bounties: [
        {
          id: "public-service-discovery",
          sponsor: "Example naming infrastructure sponsor",
          title: "Public service discovery with ENS",
          summary: "Publish service descriptions and x402 configuration on ENS so agents can discover and verify services.",
          reward: "Demo only: no real reward offered",
          requirements: ["Publish a service on testnet", "Demonstrate scoped configuration permissions", "Show an agent discovering and verifying the service"],
          eligibility: "Illustrative hackathon project; consult the actual event rules for eligibility.",
          submissionChecklist: ["Working demo URL", "Source repository", "Short demonstration video", "Testnet transaction links"],
          resources: ["https://ens.domains/", "https://www.x402.org/"],
        },
        {
          id: "agent-payment-experience",
          sponsor: "Example payments infrastructure sponsor",
          title: "Agent service payments",
          summary: "Let an agent discover a paid API and verify its payment request before signing.",
          reward: "Demo only: no real reward offered",
          requirements: ["Expose an x402 endpoint", "Demonstrate a successful testnet purchase", "Demonstrate a rejected mismatched payment request"],
          eligibility: "Illustrative hackathon project; consult the actual event rules for eligibility.",
          submissionChecklist: ["Callable endpoint", "Integration instructions", "Payment receipt"],
          resources: ["https://www.x402.org/"],
        },
      ],
    },
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
