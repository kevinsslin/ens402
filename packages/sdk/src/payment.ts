import { getAddress, isAddress } from 'viem';
import type { ServiceAuthority } from './ens.js';
import { canonicalResourceUrl } from './ens.js';
import { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC } from './constants.js';

export interface ExactRequirement {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
}

export interface PaymentCandidate {
  serviceName: string;
  resourceUrl: string;
  requirement: ExactRequirement;
  payer: `0x${string}`;
}

export interface VerifiedPayment extends PaymentCandidate {
  authority: ServiceAuthority;
  amountAtomic: bigint;
}

export function verifyPayment(candidate: PaymentCandidate, authority: ServiceAuthority): VerifiedPayment {
  const requirement = candidate.requirement;
  if (candidate.serviceName !== authority.name) throw new Error('ENS service name mismatch');
  if (canonicalResourceUrl(candidate.resourceUrl) !== authority.endpoint) throw new Error('Service URL does not match ENS');
  if (requirement.scheme !== 'exact') throw new Error('Only exact payments are supported');
  if (requirement.network !== BASE_SEPOLIA_NETWORK) throw new Error('Unsupported payment network');
  if (!isAddress(requirement.asset) || getAddress(requirement.asset) !== getAddress(BASE_SEPOLIA_USDC)) {
    throw new Error('Payment asset is not canonical Base Sepolia USDC');
  }
  if (!isAddress(requirement.payTo) || getAddress(requirement.payTo) !== getAddress(authority.payTo)) {
    throw new Error('Payment payTo does not match ENS');
  }
  if (!isAddress(candidate.payer)) throw new Error('Invalid payer');
  if (!/^[1-9][0-9]*$/.test(requirement.amount)) throw new Error('Payment amount must be positive atomic USDC');
  return { ...candidate, amountAtomic: BigInt(requirement.amount), authority };
}
