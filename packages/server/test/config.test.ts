import { describe,it,expect } from 'vitest';
import { authorized, amount, uuid } from '../src/config';
import { publicAddress, createResourceTransport } from '../src/transport';
describe('operator authentication and outbound transport',()=>{
  it('requires a long, exact bearer token',()=>{const token='a'.repeat(40);expect(authorized(`Bearer ${token}`,token)).toBe(true);expect(authorized(`Bearer ${token}x`,token)).toBe(false);expect(authorized(null,token)).toBe(false);expect(authorized('Bearer short','short')).toBe(false);});
  it.each(['127.0.0.1','10.1.2.3','169.254.169.254','192.168.0.1','0.0.0.0','::1','::ffff:127.0.0.1','fc00::1','fe80::1'])('rejects private or reserved IP %s',ip=>expect(publicAddress(ip)).toBe(false));
  it('accepts public unicast addresses',()=>{expect(publicAddress('8.8.8.8')).toBe(true);expect(publicAddress('2606:4700:4700::1111')).toBe(true);});
  it('rejects unapproved origins and embedded credentials before fetching',async()=>{const request=createResourceTransport(['https://merchant.example']);const init={method:'GET' as const,headers:{},redirect:'error' as const,signal:AbortSignal.timeout(1000)};await expect(request('https://evil.example',init)).rejects.toThrow('not allowed');await expect(request('https://user:pass@merchant.example',init)).rejects.toThrow('not allowed');});
  it('checks amount limits and idempotency key shape',()=>{expect(()=>amount('1e6','1000000')).toThrow();expect(()=>amount('1000001','1000000')).toThrow();expect(()=>uuid('random text')).toThrow();});
});
