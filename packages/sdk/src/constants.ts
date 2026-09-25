import type { Address } from 'viem';

export const BASE_SEPOLIA_NETWORK = 'eip155:84532';
export const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
export const BASE_SEPOLIA_USDC_EIP712_NAME = 'USDC';
export const BASE_SEPOLIA_USDC_EIP712_VERSION = '2';
export const MAX_PAYMENT_TIMEOUT_SECONDS = 300;
export const APPROVAL_WINDOW_MS = 30 * 60 * 1000;
export const PAYMENT_INTENT_MAX_AGE_MS = 35 * 60 * 1000;
export const BASE_SEPOLIA_COIN_TYPE = 0x80014a34n;
export const ENS_V2_UNIVERSAL_RESOLVER = '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe' as Address;
export const ENS_V2_FACTORY = '0x118bc31a50d559f7015a8da26d54b3b030cdb70f' as Address;
export const ENS_V2_PERMISSIONED_RESOLVER_IMPL = '0x7e4b2d59938930168024201752ee5503df402303' as Address;
export const ENDPOINT_RECORD_KEY = 'agent-endpoint[x402]';
