import {
  hashMessage,
  bytesToHex,
  encodeFunctionData,
  isAddress,
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { packetToBytes, normalize } from "viem/ens";
import { currentDeployment, currentResolverAbi } from "./current";
import { factoryAbi } from "./abi";

export const managementAbi = parseAbi([
  "function roles(uint256 resource,address account) view returns(uint256)",
  "function hasRoles(uint256 resource,uint256 roles,address account) view returns(bool)",
  "function hasRootRoles(uint256 roles,address account) view returns(bool)",
  "function grantRootRoles(uint256 roles,address account) returns(bool)",
  "function revokeRootRoles(uint256 roles,address account) returns(bool)",
  "function revokeRoles(uint256 resource,uint256 roles,address account) returns(bool)",
  "function multicall(bytes[] calls) returns(bytes[])",
  "function getSubregistry(string label) view returns(address)",
  "function getResolver(string label) view returns(address)",
  "function findOwner(string label) view returns(address)",
  "function findTokenId(string label) view returns(uint256)",
  "function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data)",
]);
export type ManagementTransaction = {
  chainId: 11155111;
  from: Address;
  to: Address;
  data: Hex;
  value: "0x0";
  purpose: string;
};
const text = 16n;
const textAdmin = text << 128n;
const keys = [
  "agent-endpoint[x402]",
  "description",
  "avatar",
  "ens402.call",
  "ens402.payment",
  "ens402.status",
];
function addresses(...values: Address[]) {
  if (
    values.some((a) => !isAddress(a) || a.toLowerCase() === zeroAddress) ||
    new Set(values.map((a) => a.toLowerCase())).size !== values.length
  )
    throw Error("Use distinct nonzero management addresses");
}
async function pinned(
  client: PublicClient,
  address: Address,
  kind: "resolver" | "registry",
  blockNumber: bigint,
) {
  if ((await client.getChainId()) !== 11155111)
    throw Error("Management requires Sepolia");
  const code = await client.getCode({
    address: currentDeployment.factory,
    blockNumber,
  });
  if (!code || keccak256(code) !== currentDeployment.factoryCodeHash)
    throw Error("Native factory pin changed");
  const expected =
    kind === "resolver"
      ? currentDeployment.resolverImplementation
      : currentDeployment.registryImplementation;
  const implementation = await client.readContract({
    address: currentDeployment.factory,
    abi: factoryAbi,
    functionName: "verifyContract",
    args: [address],
    blockNumber,
  });
  if (implementation.toLowerCase() !== expected.toLowerCase())
    throw Error("Unsupported native management target");
}
const resource = (key: string) => BigInt(keccak256(stringToHex(key)));
const tx = (
  from: Address,
  to: Address,
  data: Hex,
  purpose: string,
): ManagementTransaction => ({
  chainId: 11155111,
  from,
  to,
  data,
  value: "0x0",
  purpose,
});

/** All configured keys on the shared resolver change together. payTo values remain untouched. */
export async function prepareDelegateRotation(
  client: PublicClient,
  input: {
    resolver: Address;
    admin: Address;
    outgoing: Address;
    incoming: Address;
    role: "ops" | "treasury";
    name: string;
  },
) {
  if (!["ops", "treasury"].includes(input.role))
    throw Error("Unsupported delegate role");
  addresses(input.admin, input.outgoing, input.incoming);
  const block = await client.getBlock();
  await pinned(client, input.resolver, "resolver", block.number);
  if (input.role === "treasury") {
    const code = await client.getCode({
      address: input.incoming,
      blockNumber: block.number,
    });
    if (!code || code === "0x")
      throw Error(
        "Treasury must be a deployed Safe; verify its owners and threshold separately",
      );
  }
  if (
    !(await client.readContract({
      address: input.resolver,
      abi: managementAbi,
      functionName: "hasRootRoles",
      args: [textAdmin, input.admin],
      blockNumber: block.number,
    }))
  )
    throw Error("Signer lacks resolver text administration");
  const selected = input.role === "ops" ? keys.slice(0, 4) : ["ens402.payment"];
  for (const account of [input.outgoing, input.incoming]) {
    const root = await client.readContract({
      address: input.resolver,
      abi: managementAbi,
      functionName: "roles",
      args: [0n, account],
      blockNumber: block.number,
    });
    if (root !== 0n)
      throw Error(
        "Delegate has root privileges; narrow rotation would not remove its control",
      );
    for (const key of keys) {
      const actual = await client.readContract({
        address: input.resolver,
        abi: managementAbi,
        functionName: "roles",
        args: [resource(key), account],
        blockNumber: block.number,
      });
      if (
        account.toLowerCase() === input.outgoing.toLowerCase() &&
        selected.includes(key) &&
        (actual & text) === 0n
      )
        throw Error(
          "Outgoing delegate does not hold all selected grants; verify its address or completed rotation",
        );
      if ((actual & ~text) !== 0n || (!selected.includes(key) && actual !== 0n))
        throw Error("Delegate has conflicting key/admin privileges");
    }
  }
  const dns = bytesToHex(packetToBytes(normalize(input.name)));
  const calls: Hex[] = [];
  for (const key of selected) {
    calls.push(
      encodeFunctionData({
        abi: currentResolverAbi,
        functionName: "grantSetterRoles",
        args: [
          encodeFunctionData({
            abi: currentResolverAbi,
            functionName: "setText",
            args: [dns, key, ""],
          }),
          input.incoming,
        ],
      }),
    );
    calls.push(
      encodeFunctionData({
        abi: managementAbi,
        functionName: "revokeRoles",
        args: [resource(key), text, input.outgoing],
      }),
    );
  }
  const transaction = tx(
    input.admin,
    input.resolver,
    encodeFunctionData({
      abi: managementAbi,
      functionName: "multicall",
      args: [calls],
    }),
    `Replace ${input.role} across this resolver without changing records`,
  );
  await client.call({
    account: transaction.from,
    to: transaction.to,
    data: transaction.data,
  });
  return {
    transaction,
    observedBlock: String(block.number),
    scope: "Every record bundle on this resolver",
    expected: {
      keys: selected,
      outgoing: input.outgoing,
      incoming: input.incoming,
    },
  };
}

/** Re-read actual effective grants after confirmation; a prepared plan is not a successful rotation. */
export async function verifyDelegateRotation(
  client: PublicClient,
  input: Parameters<typeof prepareDelegateRotation>[1],
) {
  if (!["ops", "treasury"].includes(input.role))
    throw Error("Unsupported delegate role");
  const block = await client.getBlock();
  await pinned(client, input.resolver, "resolver", block.number);
  const selected = input.role === "ops" ? keys.slice(0, 4) : ["ens402.payment"];
  const checks = [];
  for (const account of [input.outgoing, input.incoming])
    for (const key of keys) {
      const expected =
        account.toLowerCase() === input.incoming.toLowerCase() &&
        selected.includes(key);
      const actual = await client.readContract({
        address: input.resolver,
        abi: managementAbi,
        functionName: "hasRoles",
        args: [resource(key), text, account],
        blockNumber: block.number,
      });
      const admin = await client.readContract({
        address: input.resolver,
        abi: managementAbi,
        functionName: "hasRoles",
        args: [resource(key), textAdmin, account],
        blockNumber: block.number,
      });
      const root = await client.readContract({
        address: input.resolver,
        abi: managementAbi,
        functionName: "roles",
        args: [0n, account],
        blockNumber: block.number,
      });
      checks.push({
        account,
        key,
        expected,
        actual,
        passed: actual === expected && !admin && root === 0n,
      });
    }
  return {
    block: String(block.number),
    blockHash: block.hash,
    passed: checks.every((c) => c.passed),
    checks,
  };
}

export type AdminHandover = {
  outgoing: Address;
  incoming: Address;
  resolver?: Address;
  registry?: Address;
  nameRegistry: Address;
  label: string;
  nonce: Hex;
  deadline: number;
};
/** The incoming address signs this complete scope using personal_sign or ERC-1271 validation. */
export function adminAcceptanceMessage(input: AdminHandover) {
  addresses(input.outgoing, input.incoming);
  if (
    !/^0x[0-9a-fA-F]{64}$/.test(input.nonce) ||
    !Number.isSafeInteger(input.deadline) ||
    !input.label ||
    input.label.includes(".")
  )
    throw Error("Invalid handover scope");
  return [
    "ENS402 native Admin handover acceptance",
    "Chain: 11155111",
    `Outgoing: ${input.outgoing.toLowerCase()}`,
    `Incoming: ${input.incoming.toLowerCase()}`,
    `Name registry: ${input.nameRegistry.toLowerCase()}`,
    `Label: ${input.label}`,
    `Registry administration: ${input.registry?.toLowerCase() ?? "none"}`,
    `Resolver administration: ${input.resolver?.toLowerCase() ?? "none"}`,
    `Nonce: ${input.nonce}`,
    `Deadline: ${input.deadline}`,
  ].join("\n");
}

/** Resumable handover. Returns one next transaction only; re-read after each receipt.
 * Acceptance is checked by this planner, not by ENS contracts; nonce is scope binding,
 * not an onchain consumed nonce. Wallet owners can bypass this workflow.
 * Cross-contract changes cannot be atomic with native resolver multicall. No outgoing root
 * rights are removed until incoming rights and name ownership have been observed onchain.
 */
export async function prepareAdminHandover(
  client: PublicClient,
  input: AdminHandover,
  acceptance: Hex,
  trustedProvider?: { providerRegistry: Address; resolver: Address },
  dedicatedResolver = false,
) {
  const message = adminAcceptanceMessage(input);
  const block = await client.getBlock();
  if (
    BigInt(input.deadline) <= block.timestamp ||
    BigInt(input.deadline) > block.timestamp + 86400n
  )
    throw Error("Acceptance expired or exceeds one-day handover window");
  const incomingCode = await client.getCode({
    address: input.incoming,
    blockNumber: block.number,
  });
  let accepted = false;
  if (incomingCode && incomingCode !== "0x") {
    try {
      accepted =
        (await client.readContract({
          address: input.incoming,
          abi: parseAbi([
            "function isValidSignature(bytes32,bytes) view returns(bytes4)",
          ]),
          functionName: "isValidSignature",
          args: [hashMessage(message), acceptance],
          blockNumber: block.number,
        })) === "0x1626ba7e";
    } catch {
      accepted = false;
    }
  } else
    accepted = await client.verifyMessage({
      address: input.incoming,
      message,
      signature: acceptance,
      blockNumber: block.number,
    });
  if (!accepted) throw Error("Incoming Admin has not accepted this scope");
  await pinned(client, input.nameRegistry, "registry", block.number);
  if (input.registry) {
    if (
      trustedProvider?.providerRegistry.toLowerCase() ===
        input.registry.toLowerCase() &&
      !input.resolver
    )
      throw Error(
        "Configured shared provider handover must include resolver administration",
      );
    const pointer = await client.readContract({
      address: input.nameRegistry,
      abi: managementAbi,
      functionName: "getSubregistry",
      args: [input.label],
      blockNumber: block.number,
    });
    if (pointer.toLowerCase() !== input.registry.toLowerCase())
      throw Error("Provider registry does not match the live name pointer");
    if (
      input.resolver &&
      (!trustedProvider ||
        trustedProvider.providerRegistry.toLowerCase() !==
          input.registry.toLowerCase() ||
        trustedProvider.resolver.toLowerCase() !== input.resolver.toLowerCase())
    )
      throw Error(
        "Shared resolver handover requires independently configured provider binding",
      );
  } else if (input.resolver) {
    if (!dedicatedResolver)
      throw Error(
        "Service resolver governance transfer requires explicit dedicated-resolver policy",
      );
    const count = await client.readContract({
      address: input.resolver,
      abi: currentResolverAbi,
      functionName: "getRecordCount",
      blockNumber: block.number,
    });
    if (count !== 1n)
      throw Error(
        "Service resolver governance cannot be moved for a multi-bundle resolver",
      );
    const pointer = await client.readContract({
      address: input.nameRegistry,
      abi: managementAbi,
      functionName: "getResolver",
      args: [input.label],
      blockNumber: block.number,
    });
    if (pointer.toLowerCase() !== input.resolver.toLowerCase())
      throw Error("Service resolver does not match the live name pointer");
    if (
      trustedProvider?.resolver.toLowerCase() === input.resolver.toLowerCase()
    )
      throw Error(
        "Service-name transfer must not transfer shared provider resolver governance",
      );
  }
  const owner = await client.readContract({
    address: input.nameRegistry,
    abi: managementAbi,
    functionName: "findOwner",
    args: [input.label],
    blockNumber: block.number,
  });
  if (
    ![input.outgoing.toLowerCase(), input.incoming.toLowerCase()].includes(
      owner.toLowerCase(),
    )
  )
    throw Error("Name owner changed outside this handover");
  const targets = [
    ...(input.registry
      ? [
          {
            address: input.registry,
            kind: "registry" as const,
            roles: 1n | (1n << 128n),
          },
        ]
      : []),
    ...(input.resolver
      ? [
          {
            address: input.resolver,
            kind: "resolver" as const,
            roles: text | textAdmin,
          },
        ]
      : []),
  ];
  const observed = [];
  for (const target of targets) {
    await pinned(client, target.address, target.kind, block.number);
    const outgoing = await client.readContract({
      address: target.address,
      abi: managementAbi,
      functionName: "roles",
      args: [0n, input.outgoing],
      blockNumber: block.number,
    });
    const incoming = await client.readContract({
      address: target.address,
      abi: managementAbi,
      functionName: "roles",
      args: [0n, input.incoming],
      blockNumber: block.number,
    });
    if ((outgoing & ~target.roles) !== 0n || (incoming & ~target.roles) !== 0n)
      throw Error("Unexpected root authority requires explicit review");
    observed.push({ ...target, outgoing, incoming });
  }
  let transaction: ManagementTransaction | undefined;
  let stage = "complete";
  const missing = observed.find((t) => t.incoming !== t.roles);
  if (missing) {
    if (missing.outgoing !== missing.roles)
      throw Error("No verified outgoing authority to complete handover");
    stage = "grant-incoming";
    transaction = tx(
      input.outgoing,
      missing.address,
      encodeFunctionData({
        abi: managementAbi,
        functionName: "grantRootRoles",
        args: [missing.roles, input.incoming],
      }),
      "Grant accepted incoming Admin; outgoing remains for recovery",
    );
  } else if (owner.toLowerCase() === input.outgoing.toLowerCase()) {
    stage = "transfer-name";
    const id = await client.readContract({
      address: input.nameRegistry,
      abi: managementAbi,
      functionName: "findTokenId",
      args: [input.label],
      blockNumber: block.number,
    });
    transaction = tx(
      input.outgoing,
      input.nameRegistry,
      encodeFunctionData({
        abi: managementAbi,
        functionName: "safeTransferFrom",
        args: [input.outgoing, input.incoming, id, 1n, "0x"],
      }),
      "Transfer current name token; third-party delegates remain unchanged",
    );
  } else {
    const remaining = observed.find((t) => t.outgoing !== 0n);
    if (remaining) {
      stage = "remove-outgoing";
      transaction = tx(
        input.incoming,
        remaining.address,
        encodeFunctionData({
          abi: managementAbi,
          functionName: "revokeRootRoles",
          args: [remaining.outgoing, input.outgoing],
        }),
        "Incoming Admin removes outgoing root authority after verified transfer",
      );
    }
  }
  if (!transaction && input.resolver)
    for (const key of keys) {
      const retains = await client.readContract({
        address: input.resolver,
        abi: managementAbi,
        functionName: "hasRoles",
        args: [resource(key), text, input.outgoing],
        blockNumber: block.number,
      });
      const retainsAdmin = await client.readContract({
        address: input.resolver,
        abi: managementAbi,
        functionName: "hasRoles",
        args: [resource(key), textAdmin, input.outgoing],
        blockNumber: block.number,
      });
      if (retains || retainsAdmin)
        throw Error(
          "Outgoing Admin retains scoped resolver rights; explicit cleanup required",
        );
    }
  if (transaction)
    await client.call({
      account: transaction.from,
      to: transaction.to,
      data: transaction.data,
    });
  return {
    stage,
    transaction,
    observedBlock: String(block.number),
    observedBlockHash: block.hash,
    scope:
      "Named root grants and name ownership; other holders and ancestor authority are outside this handover",
  };
}
