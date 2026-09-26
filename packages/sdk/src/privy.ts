import type { PolicyCreateParams, PolicyCondition, EthereumTypedDataInput } from '@privy-io/node/resources';
import { authorizationTypes, type ClientEvmSigner } from '@x402/evm';
import { verifyTypedData, type Address, type Hex } from 'viem';
import { USDC, addressPattern, sameAddress, validAmount } from './index';

export type SigningScope = { payTo: string; maxAmount: string; expiresAt: number };
export const paymentTypes = {
  EIP712Domain: [
    { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
  ],
  TransferWithAuthorization: authorizationTypes.TransferWithAuthorization.map(field => ({ ...field })),
};
function assertScope(scope: SigningScope) {
  if (!addressPattern.test(scope.payTo) || !validAmount(scope.maxAmount) || BigInt(scope.maxAmount) <= 0n || !Number.isSafeInteger(scope.expiresAt) || scope.expiresAt <= 0) throw new Error('Invalid signing scope');
}
/** One restrictive ALLOW. A changed type map cannot bypass a DENY-only filter. */
export function buildPrivyPolicy(scope: SigningScope): PolicyCreateParams {
  assertScope(scope);
  const typed_data = { primary_type: 'TransferWithAuthorization', types: structuredClone(paymentTypes) };
  const message = (field: string, operator: 'eq' | 'lte' | 'gt', value: string): PolicyCondition => ({ field_source: 'ethereum_typed_data_message', field, operator, value, typed_data });
  return {
    name: 'ENS402 Base Sepolia payment scope', version: '1.0', chain_type: 'ethereum',
    rules: [{ name: 'Only approved USDC payment authorizations', method: 'eth_signTypedData_v4', action: 'ALLOW', conditions: [
      { field_source: 'ethereum_typed_data_domain', field: 'chainId', operator: 'eq', value: '84532' },
      { field_source: 'ethereum_typed_data_domain', field: 'verifyingContract', operator: 'eq', value: USDC },
      message('to', 'eq', scope.payTo.toLowerCase()), message('value', 'gt', '0'),
      message('value', 'lte', scope.maxAmount), message('validAfter', 'eq', '0'),
      message('validBefore', 'lte', String(scope.expiresAt)),
      { field_source: 'system', field: 'current_unix_timestamp', operator: 'lt', value: String(scope.expiresAt) },
    ] }],
  };
}
export type TypedInput = Parameters<ClientEvmSigner['signTypedData']>[0];
export function privyPaymentInput(input: TypedInput, payer: string, scope: SigningScope, now: number): EthereumTypedDataInput {
  assertScope(scope);
  const domain = input.domain;
  const message = input.message;
  const typeNames = Object.keys(input.types).sort().join(',');
  if (typeNames !== 'TransferWithAuthorization' && typeNames !== 'EIP712Domain,TransferWithAuthorization') throw new Error('Unsupported payment type');
  for (const key of Object.keys(input.types)) {
    if (JSON.stringify(input.types[key]) !== JSON.stringify(paymentTypes[key as keyof typeof paymentTypes])) throw new Error('Payment type fields changed');
  }
  if (input.primaryType !== 'TransferWithAuthorization' || domain.name !== 'USDC' || domain.version !== '2' || Number(domain.chainId) !== 84532 || !sameAddress(String(domain.verifyingContract), USDC) || Object.keys(domain).sort().join(',') !== 'chainId,name,verifyingContract,version') throw new Error('Unsupported payment domain');
  const value = String(message.value);
  const validBefore = Number(message.validBefore);
  if (!sameAddress(String(message.from), payer) || !sameAddress(String(message.to), scope.payTo) || !validAmount(value) || BigInt(value) <= 0n || BigInt(value) > BigInt(scope.maxAmount) || String(message.validAfter) !== '0' || !Number.isSafeInteger(validBefore) || validBefore <= now || validBefore > now + 300 || validBefore > scope.expiresAt || now >= scope.expiresAt || !/^0x[0-9a-fA-F]{64}$/.test(String(message.nonce)) || Object.keys(message).sort().join(',') !== 'from,nonce,to,validAfter,validBefore,value') throw new Error('Payment is outside the signing scope');
  return { domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC }, types: structuredClone(paymentTypes), primary_type: 'TransferWithAuthorization', message: { from: String(message.from), to: String(message.to), value, validAfter: '0', validBefore: String(validBefore), nonce: String(message.nonce) } };
}

/** Server-only adapter. The integrator supplies its own Privy account and policy-bound wallet. */
export type PrivySigningClient = { wallets(): { ethereum(): { signTypedData(walletId: string, input: { params: { typed_data: EthereumTypedDataInput } }): Promise<{ signature: string }> } } };
export function createPrivySigner(options: { client: PrivySigningClient; walletId: string; address: Address; scope: SigningScope; now?: () => number }): ClientEvmSigner {
  const scope = structuredClone(options.scope);
  assertScope(scope);
  return {
    address: options.address,
    async signTypedData(input) {
      const data = privyPaymentInput(input, options.address, scope, options.now?.() ?? Math.floor(Date.now() / 1000));
      const { signature } = await options.client.wallets().ethereum().signTypedData(options.walletId, { params: { typed_data: data } });
      if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error('Invalid Privy EOA signature');
      // Verify the provider signed the exact requested message with the expected wallet.
      const valid = await verifyTypedData({ address: options.address, domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC }, types: authorizationTypes, primaryType: 'TransferWithAuthorization', message: {
        from: String(data.message.from) as Address, to: String(data.message.to) as Address, value: BigInt(String(data.message.value)), validAfter: 0n, validBefore: BigInt(String(data.message.validBefore)), nonce: String(data.message.nonce) as Hex,
      }, signature: signature as Hex });
      if (!valid) throw new Error('Privy signature did not match the payment');
      return signature as Hex;
    },
  };
}
