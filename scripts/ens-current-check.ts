import {config} from 'dotenv';
import {mkdir,writeFile} from 'node:fs/promises';
import {createPublicClient,http,keccak256,type Address} from 'viem';
import {sepolia} from 'viem/chains';
config({path:'.env',quiet:true});
const client=createPublicClient({chain:sepolia,transport:http(process.env.SEPOLIA_RPC_URL),ccipRead:false});
if(await client.getChainId()!==11155111)throw new Error('Expected Sepolia');
const report:Record<string,unknown>={chainId:11155111,sourceCommit:'71a3b7339dbc55ab47667abdfe8303bac4f4c24e'};
for(const name of ['UniversalResolverV2','PermissionedResolverImpl','VerifiableFactory','UserRegistryImpl','ETHRegistrar','ETHRegistry','RootRegistry']){
 const response=await fetch(`https://raw.githubusercontent.com/ensdomains/contracts-v2/${report.sourceCommit}/contracts/deployments/sepolia/${name}.json`,{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Cannot load pinned artifact ${name}: ${response.status}`);
 const d=await response.json() as {address:Address;abi:readonly unknown[]};
 const code=await client.getCode({address:d.address as Address});if(!code)throw new Error('Missing code');report[name]={address:d.address,codeHash:keccak256(code)};
 if(name==='ETHRegistrar')report.available=await client.readContract({address:d.address,abi:d.abi as import('viem').Abi,functionName:'isAvailable',args:['ens402']});
}
console.log(JSON.stringify(report,null,2));await mkdir('docs/validation',{recursive:true});await writeFile('docs/validation/current-ens-deployment.json',JSON.stringify(report,null,2));
