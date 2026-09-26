import {it,expect,vi,beforeEach} from 'vitest';
const f=vi.hoisted(()=>({inspect:vi.fn(),screen:vi.fn(),rate:vi.fn()}));
vi.mock('@ens402/server',()=>({inspectService:f.inspect,screenRecipient:f.screen,getStore:()=>({rateLimit:f.rate})}));
import {POST} from '../src/app/api/checkout/quote/route';
beforeEach(()=>vi.resetAllMocks());
it('offers read-only preflight without login or checkout creation',async()=>{
 f.inspect.mockResolvedValue({name:'bounty-info.ethglobal.ens402.eth',payment:{payTo:'recipient'}});f.screen.mockResolvedValue({provider:'intercepta'});
 const response=await POST(new Request('https://example.com/api/checkout/quote',{method:'POST',body:JSON.stringify({name:'bounty-info.ethglobal.ens402.eth'})}));
 expect(response.status).toBe(200);expect(f.screen).toHaveBeenCalledWith('recipient');expect(f.rate).toHaveBeenCalledOnce();
});
it('rejects caller-supplied recipients and does not leak backend errors',async()=>{
 const req=(value:unknown)=>new Request('https://example.com/api/checkout/quote',{method:'POST',body:JSON.stringify(value)});
 expect((await POST(req({name:'x.provider.eth',payTo:'attacker'}))).status).toBe(400);expect(f.inspect).not.toHaveBeenCalled();
 f.inspect.mockRejectedValue(Error('private credentials'));
 const response=await POST(req({name:'x.provider.eth'}));expect(response.status).toBe(503);expect(await response.text()).not.toContain('credentials');
});
