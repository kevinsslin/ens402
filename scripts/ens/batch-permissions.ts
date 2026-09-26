import { encodeFunctionData, parseAbi } from "viem";
const abi = parseAbi(["function multicall(bytes[] calls) returns(bytes[])"]);
type Step = {
  signer: string;
  to?: string;
  data: string;
  value?: string;
  description: string;
  actions?: string[];
};
/** Batch consecutive zero-value calls only on already-verified native Resolver targets.
 * Keep deployment, signer changes, contract boundaries and ordering intact.
 */
export function batchNativePermissions<T extends Step>(
  steps: T[],
  nativeTargets: readonly string[],
): Array<T & { actions?: string[] }> {
  const allowed = new Set(nativeTargets.map((a) => a.toLowerCase()));
  const result: Array<T & { actions?: string[] }> = [];
  for (let i = 0; i < steps.length; ) {
    const first = steps[i]!;
    const group = [first];
    i++;
    if (
      first.to &&
      allowed.has(first.to.toLowerCase()) &&
      BigInt(first.value ?? 0) === 0n
    ) {
      while (i < steps.length) {
        const next = steps[i]!;
        if (
          next.to?.toLowerCase() !== first.to.toLowerCase() ||
          next.signer.toLowerCase() !== first.signer.toLowerCase() ||
          BigInt(next.value ?? 0) !== 0n
        )
          break;
        group.push(next);
        i++;
      }
    }
    result.push(
      group.length === 1
        ? first
        : {
            ...first,
            data: encodeFunctionData({
              abi,
              functionName: "multicall",
              args: [group.map((s) => s.data as `0x${string}`)],
            }),
            description: `Apply ${group.length} permission updates in one transaction`,
            actions: group.map((s) => s.description),
          },
    );
  }
  return result;
}
