import {expect,it,vi} from 'vitest';
import {SettleError,type SettleResponse} from '@x402/core/types';
vi.mock('../src/index',()=>({baseClient:()=>({}),getStore:()=>({})}));
import {settleWithRetry} from '../src/merchant';
const now=1_800_000_000;
const authorization={from:`0x${'1'.repeat(40)}`,to:`0x${'2'.repeat(40)}`,value:'10000',validAfter:'0',validBefore:String(now+50),nonce:`0x${'ab'.repeat(32)}`};
const underpriced:SettleResponse={success:false,errorReason:'invalid_exact_evm_transaction_failed',errorMessage:'Details: replacement transaction underpriced',transaction:'',network:'eip155:84532'};
const settled:SettleResponse={success:true,payer:authorization.from,transaction:`0x${'cd'.repeat(32)}`,network:'eip155:84532'};
const options=(used=false)=>({authorizationUsed:vi.fn(async()=>used),now:()=>now,sleep:vi.fn(async()=>{})});

it('retries a relayer failure that proves nothing was broadcast',async()=>{
 const settle=vi.fn().mockResolvedValueOnce(underpriced).mockResolvedValueOnce(settled);const o=options();
 await expect(settleWithRetry(settle,authorization,o)).resolves.toEqual(settled);
 expect(settle).toHaveBeenCalledTimes(2);expect(o.authorizationUsed).toHaveBeenCalledOnce();
});
it('retries the same failure when the facilitator reports it as an HTTP error',async()=>{
 const settle=vi.fn().mockRejectedValueOnce(new SettleError(500,underpriced)).mockResolvedValueOnce(settled);
 await expect(settleWithRetry(settle,authorization,options())).resolves.toEqual(settled);
});
it('stops after three retries and returns the last failure',async()=>{
 const settle=vi.fn().mockResolvedValue(underpriced);
 await expect(settleWithRetry(settle,authorization,options())).resolves.toEqual(underpriced);
 expect(settle).toHaveBeenCalledTimes(4);
});
it.each([
 ['a different failure',{...underpriced,errorMessage:'Details: execution reverted'}],
 ['a failure with a transaction hash',{...underpriced,transaction:`0x${'ef'.repeat(32)}`}],
])('does not retry %s',async(_label,failure)=>{
 const settle=vi.fn().mockResolvedValue(failure);
 await expect(settleWithRetry(settle,authorization,options())).resolves.toEqual(failure);
 expect(settle).toHaveBeenCalledOnce();
});
it('does not retry when the authorization is about to expire',async()=>{
 const settle=vi.fn().mockResolvedValue(underpriced);
 await expect(settleWithRetry(settle,{...authorization,validBefore:String(now+10)},options())).resolves.toEqual(underpriced);
 expect(settle).toHaveBeenCalledOnce();
});
it('never resubmits an authorization the token already consumed',async()=>{
 const settle=vi.fn().mockResolvedValue(underpriced);
 await expect(settleWithRetry(settle,authorization,options(true))).rejects.toThrow('reconcile');
 expect(settle).toHaveBeenCalledOnce();
});
it('keeps unknown thrown failures with reconciliation',async()=>{
 const settle=vi.fn().mockRejectedValue(Error('socket hang up'));
 await expect(settleWithRetry(settle,authorization,options())).rejects.toThrow('socket hang up');
 expect(settle).toHaveBeenCalledOnce();
});
