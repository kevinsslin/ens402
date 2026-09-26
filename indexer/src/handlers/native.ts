import { indexer } from "envio";
const registryImplementation = "0xa80338aaa8d23831cea25e858d1774534abb0263";
const resolverImplementation = "0x14f09fd05d4585759e54844dc9b00147131cf243";
const zero = "0x0000000000000000000000000000000000000000";
// Envio replays the entire discovery block, including initializer logs before ProxyDeployed.
indexer.contractRegister({ contract: "Factory", event: "ProxyDeployed" }, async ({ event, context }) => {
  if (event.params.implementation.toLowerCase() === registryImplementation) context.chain.Registry.add(event.params.proxyAddress);
  if (event.params.implementation.toLowerCase() === resolverImplementation) context.chain.Resolver.add(event.params.proxyAddress);
});
indexer.contractRegister({ contract: "Registry", event: "SubregistryUpdated" }, async ({ event, context }) => {
  if (event.params.subregistry.toLowerCase() !== zero) context.chain.Registry.add(event.params.subregistry);
});
indexer.contractRegister({ contract: "Registry", event: "ResolverUpdated" }, async ({ event, context }) => {
  if (event.params.resolver.toLowerCase() !== zero) context.chain.Resolver.add(event.params.resolver);
});

// Persist events, not inferred authorization or mutable token-ID ownership shortcuts.
// The bounded snapshot exporter performs canonical state reads at a fixed block.
indexer.onEvent({ contract: "Factory", event: "ProxyDeployed" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Factory.ProxyDeployed", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "LabelRegistered" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.LabelRegistered", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "LabelReserved" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.LabelReserved", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "LabelUnregistered" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.LabelUnregistered", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "ExpiryUpdated" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.ExpiryUpdated", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "SubregistryUpdated" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.SubregistryUpdated", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "ResolverUpdated" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.ResolverUpdated", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "TokenRegenerated" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.TokenRegenerated", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "TokenResource" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.TokenResource", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "TransferSingle" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.TransferSingle", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "TransferBatch" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.TransferBatch", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "EACRolesChanged" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.EACRolesChanged", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "ParentUpdated" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.ParentUpdated", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Registry", event: "Upgraded" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Registry.Upgraded", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Resolver", event: "TextUpdated" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Resolver.TextUpdated", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Resolver", event: "Linked" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Resolver.Linked", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Resolver", event: "Cleared" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Resolver.Cleared", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Resolver", event: "EACRolesChanged" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Resolver.EACRolesChanged", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});
indexer.onEvent({ contract: "Resolver", event: "Upgraded" }, async ({ event, context }) => {
  context.NativeEvent.set({ id: `${event.chainId}:${event.block.number}:${event.logIndex}`, chainId: event.chainId,
    contract: event.srcAddress.toLowerCase(), kind: "Resolver.Upgraded", blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash, logIndex: event.logIndex,
    params: JSON.stringify(event.params, (_, value) => typeof value === "bigint" ? value.toString() : value) });
});

// Used by the snapshot bridge to refuse partially indexed blocks.
indexer.onBlock({ name: "catalog-checkpoint" }, async ({ block, context }) => {
  context.IndexedHead.set({ id: String(context.chain.id), blockNumber: BigInt(block.number) });
});
