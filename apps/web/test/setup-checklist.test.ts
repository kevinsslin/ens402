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

import {setupChecklistState} from '../src/components/setup-checklist';
it('retains verified checks while a remaining batch is being signed',()=>{
 const states=setupChecklistState(2,[{description:'Apply 2 permission updates in one transaction',actions:[
 `Grant avatar writer across this provider resolver to ${parties.registrar}`,
 `Grant ens402.call writer across this provider resolver to ${parties.registrar}`,
 ]}],parties);
 expect(states.filter(s=>s==='complete')).toHaveLength(14);
 expect(states[11]).toBe('pending');expect(states[12]).toBe('pending');
 expect(states[9]).toBe('complete');expect(states[15]).toBe('complete');
});
it('marks every item complete once the final fresh plan is ready',()=>{
 expect(setupChecklistState(3,[],parties).every(s=>s==='complete')).toBe(true);
});
it('does not mark future phases complete or infer grants before deployment',()=>{
 const states=setupChecklistState(1,[{description:'Deploy shared resolver'}],parties);
 expect(states.slice(0,2)).toEqual(['complete','complete']);
 expect(states.slice(2).every(s=>s==='pending')).toBe(true);
});
it('does not confuse retired publisher cleanup with granting the new publisher',()=>{
 expect(setupChecklistIndex('Revoke ROLE_REGISTRAR from old publisher',parties)).toBeUndefined();
 expect(setupChecklistState(2,[{description:'Revoke ROLE_REGISTRAR from old publisher'}],parties).every(s=>s==='complete')).toBe(true);
});
