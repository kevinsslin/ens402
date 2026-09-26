import { expect, it } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import { batchNativePermissions } from "../../../scripts/ens/batch-permissions";
const a = "0x1111111111111111111111111111111111111111",
  b = "0x2222222222222222222222222222222222222222";
const step = (
  data: string,
  to: string | undefined = a,
  signer = a,
  value = "0x0",
) => ({ signer, to, data, value, description: data });
it("groups same-target permissions without changing calldata order", () => {
  const result = batchNativePermissions(
    [step("0x11111111"), step("0x22222222")],
    [a],
  );
  expect(result).toHaveLength(1);
  expect(
    decodeFunctionData({
      abi: parseAbi(["function multicall(bytes[] calls) returns(bytes[])"]),
      data: result[0]!.data as `0x${string}`,
    }).args,
  ).toEqual([["0x11111111", "0x22222222"]]);
  expect(result[0]!.actions).toEqual(["0x11111111", "0x22222222"]);
});
it("does not combine deployments, target changes, signer changes or paid calls", () => {
  const steps = [
    { ...step("0x11111111"), to: undefined },
    step("0x22222222"),
    step("0x33333333", b),
    step("0x44444444", a, b),
    step("0x55555555", a, a, "1"),
  ];
  expect(batchNativePermissions(steps, [a, b])).toEqual(steps);
  expect(
    batchNativePermissions([step("0x11111111"), step("0x22222222")], []),
  ).toHaveLength(2);
});
