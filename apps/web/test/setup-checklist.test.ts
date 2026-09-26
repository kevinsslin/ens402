import {expect,it} from 'vitest';
import {setupChecklist,setupChecklistIndex} from '../src/components/setup-checklist';
const parties={ops:'0x1111111111111111111111111111111111111111',treasury:'0x2222222222222222222222222222222222222222',registrar:'0x3333333333333333333333333333333333333333'};
it('distinguishes the same field granted to Operations and the publisher',()=>{
 const description=(account:string)=>`Grant avatar writer across this provider resolver to ${account}`;
 expect(setupChecklistIndex(description(parties.ops),parties)).toBe(5);
 expect(setupChecklistIndex(description(parties.registrar),parties)).toBe(11);
 const items=setupChecklist(parties);
 expect(items[5]).toMatchObject({recipient:'Operations wallet',address:parties.ops});
 expect(items[11]).toMatchObject({recipient:'Service publisher contract',address:parties.registrar});
 expect(items[11]?.purpose).toContain('initial');
});
it('accounts for every deployment, field grant and registration grant',()=>{
 const items=setupChecklist(parties);expect(items).toHaveLength(16);
 expect([0,1,2].map(phase=>items.filter(i=>i.phase===phase).length)).toEqual([2,6,8]);
 expect(setupChecklistIndex('Grant ROLE_REGISTRAR to verified restricted ProviderServiceRegistrar',parties)).toBe(15);
 expect(setupChecklistIndex(`Grant ens402.payment writer across this provider resolver to ${parties.treasury}`,parties)).toBe(7);
 expect(setupChecklistIndex('Unknown action',parties)).toBeUndefined();
});
