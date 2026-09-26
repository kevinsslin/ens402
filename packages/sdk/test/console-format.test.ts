import { describe, expect, it } from 'vitest';
import { units, usdc, approvalStatus } from '../../../apps/web/src/components/console-format';
describe('Console money and approval display',()=>{
  it('preserves six-decimal USDC precision without rounding or floating point',()=>{
    for(const value of ['0','0.000001','0.01','1','1000000000000000000.123456']) expect(usdc(units(value))).toBe(value);
    expect(usdc('10000')).toBe('0.01');
    expect(usdc('bad')).toBe('Unavailable');
    expect(()=>units('0.0000001')).toThrow();
    expect(()=>units('-1')).toThrow();
  });
  it('expires active approvals at the deadline without overriding revoked state',()=>{
    expect(approvalStatus({state:'active',approval:{expiresAt:100}},99)).toBe('active');
    expect(approvalStatus({state:'active',approval:{expiresAt:100}},100)).toBe('expired');
    expect(approvalStatus({state:'revoked',approval:{expiresAt:100}},101)).toBe('revoked');
  });
});
