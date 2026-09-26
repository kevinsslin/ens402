import {
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseEventLogs,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { normalize, labelhash } from "viem/ens";
import { ensClient } from "@ens402/server";
import {
  currentDeployment as deployment,
  currentRegistryAbi,
} from "@ens402/sdk/ens";
import { factoryAbi } from "@ens402/sdk/ens";

export type PlatformSetup = {
  parent: string;
  owner: string;
  salt: string;
  registry?: string;
  deploymentHash?: string;
};
const abi = parseAbi([
  "function findExpiry(string label) view returns(uint64)",
  "function setSubregistry(uint256 anyId,address registry)",
  "function hasRootRoles(uint256 roles,address account) view returns(bool)",
  "event ProxyDeployed(address indexed sender,address indexed proxyAddress,uint256 salt,address implementation)",
]);
const roles = 1n | (1n << 128n);
const address = (value: string): Address => {
  if (
    typeof value !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(value) ||
    value.toLowerCase() === zeroAddress
  )
    throw Error("Use a nonzero wallet address");
  return value as Address;
};
/** Unsigned, resumable native bootstrap. Existing nonzero pointers are never replaced. */
export async function planPlatform(input: PlatformSetup, client = ensClient()) {
  const parent = normalize(input.parent);
  if (parent !== normalize(process.env.ENS_PARENT_NAME || "ens402.eth"))
    throw Error("Use the configured platform parent");
  const owner = address(input.owner);
  if (!/^\d{1,78}$/.test(input.salt) || BigInt(input.salt) >= 2n ** 256n)
    throw Error("Invalid deployment salt");
  const salt = BigInt(input.salt),
    block = await client.getBlock();
  if ((await client.getChainId()) !== 11155111)
    throw Error("Platform setup requires Sepolia");
  const code = await client.getCode({
    address: deployment.factory,
    blockNumber: block.number,
  });
  if (!code || keccak256(code) !== deployment.factoryCodeHash)
    throw Error("Native factory pin changed");
  const labels = parent.split(".");
  let nameRegistry: Address = deployment.rootRegistry,
    expiry = (1n << 64n) - 1n;
  for (let i = labels.length - 1; i >= 0; i--) {
    const bound = await client.readContract({
      address: nameRegistry,
      abi,
      functionName: "findExpiry",
      args: [labels[i]!],
      blockNumber: block.number,
    });
    expiry = bound < expiry ? bound : expiry;
    if (i > 0) {
      nameRegistry = await client.readContract({
        address: nameRegistry,
        abi: currentRegistryAbi,
        functionName: "getSubregistry",
        args: [labels[i]!],
        blockNumber: block.number,
      });
      if (nameRegistry === zeroAddress)
        throw Error("An ancestor namespace is not initialized");
    }
  }
  const label = labels[0]!;
  const actualOwner = await client.readContract({
    address: nameRegistry,
    abi: currentRegistryAbi,
    functionName: "findOwner",
    args: [label],
    blockNumber: block.number,
  });
  if (actualOwner.toLowerCase() !== owner.toLowerCase())
    throw Error("Connect the current platform name owner");
  expiry =
    expiry < block.timestamp + 2592000n ? expiry : block.timestamp + 2592000n;
  if (expiry <= block.timestamp + 86400n)
    throw Error("Renew the parent before enabling its namespace");
  const linked = await client.readContract({
    address: nameRegistry,
    abi: currentRegistryAbi,
    functionName: "getSubregistry",
    args: [label],
    blockNumber: block.number,
  });
  let registry = input.registry ? address(input.registry) : undefined;
  if (linked !== zeroAddress) {
    if (registry && linked.toLowerCase() !== registry.toLowerCase())
      throw Error("Existing platform registry differs; refusing replacement");
    registry = linked;
  }
  const initialization = encodeFunctionData({
    abi: currentRegistryAbi,
    functionName: "initialize",
    args: [[{ account: owner, roleBitmap: roles }]],
  });
  const deployArgs = [
    deployment.registryImplementation,
    salt,
    initialization,
  ] as const;
  const deployData = encodeFunctionData({
    abi: factoryAbi,
    functionName: "deployProxy",
    args: deployArgs,
  });
  const transactions: Array<{
    signer: Address;
    to: Address;
    data: Hex;
    value: "0x0";
    description: string;
  }> = [];
  if (input.deploymentHash) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(input.deploymentHash))
      throw Error("Invalid deployment receipt");
    const hash = input.deploymentHash as Hex;
    const [receipt, transaction] = await Promise.all([
      client.getTransactionReceipt({ hash }),
      client.getTransaction({ hash }),
    ]);
    const canonical = await client.getBlock({
      blockNumber: receipt.blockNumber,
    });
    if (
      receipt.status !== "success" ||
      receipt.blockNumber > block.number ||
      canonical.hash !== receipt.blockHash ||
      transaction.blockHash !== receipt.blockHash ||
      transaction.from.toLowerCase() !== owner.toLowerCase() ||
      transaction.to?.toLowerCase() !== deployment.factory.toLowerCase() ||
      transaction.input.toLowerCase() !== deployData.toLowerCase() ||
      transaction.value !== 0n
    )
      throw Error("Receipt does not match this platform deployment");
    const events = parseEventLogs({
      abi,
      eventName: "ProxyDeployed",
      logs: receipt.logs.filter(
        (log) => log.address.toLowerCase() === deployment.factory.toLowerCase(),
      ),
    });
    const event = events.find(
      (e) =>
        e.args.sender.toLowerCase() === owner.toLowerCase() &&
        e.args.salt === salt &&
        e.args.implementation.toLowerCase() ===
          deployment.registryImplementation.toLowerCase(),
    );
    if (
      !event ||
      (registry &&
        registry.toLowerCase() !== event.args.proxyAddress.toLowerCase())
    )
      throw Error("Deployment receipt registry mismatch");
    registry = event.args.proxyAddress;
  }
  if (linked === zeroAddress && !input.deploymentHash) {
    // Confirm effective pointer authority before asking the owner to spend deployment gas.
    await client.call({
      account: owner,
      to: nameRegistry,
      data: encodeFunctionData({
        abi,
        functionName: "setSubregistry",
        args: [BigInt(labelhash(label)), zeroAddress],
      }),
      blockNumber: block.number,
    });
    const { result } = await client.simulateContract({
      account: owner,
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: deployArgs,
      blockNumber: block.number,
    });
    if (registry && registry.toLowerCase() !== result.toLowerCase())
      throw Error("Platform registry prediction changed");
    registry = result;
    transactions.push({
      signer: owner,
      to: deployment.factory,
      data: deployData,
      value: "0x0",
      description: "Create platform registry",
    });
  } else {
    const implementation = await client.readContract({
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "verifyContract",
      args: [registry!],
      blockNumber: block.number,
    });
    if (
      implementation.toLowerCase() !==
      deployment.registryImplementation.toLowerCase()
    )
      throw Error("Unsupported platform registry");
    if (
      !(await client.readContract({
        address: registry!,
        abi,
        functionName: "hasRootRoles",
        args: [roles, owner],
        blockNumber: block.number,
      }))
    )
      throw Error("Platform owner lacks native registration governance");
    if (linked === zeroAddress) {
      const data = encodeFunctionData({
        abi,
        functionName: "setSubregistry",
        args: [BigInt(labelhash(label)), registry!],
      });
      await client.call({
        account: owner,
        to: nameRegistry,
        data,
        blockNumber: block.number,
      });
      transactions.push({
        signer: owner,
        to: nameRegistry,
        data,
        value: "0x0",
        description: "Attach platform registry to its ENS name",
      });
    }
  }
  return {
    setup: { ...input, parent, owner, registry },
    owner,
    ready: transactions.length === 0,
    stage:
      transactions.length === 0
        ? "complete"
        : input.deploymentHash
          ? "link"
          : "deploy",
    name: parent,
    nameRegistry,
    expiry: String(expiry),
    observedBlock: String(block.number),
    transactions,
  };
}
