import { config } from 'dotenv';
import { mkdir,writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createPublicClient,http,parseAbi,encodeFunctionData,bytesToHex,keccak256,type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { normalize,labelhash,packetToBytes } from 'viem/ens';
import { currentDeployment as ensDeployment,factoryAbi,currentResolverAbi as resolverAbi,currentRegistryAbi,universalAbi,prepareRecordUpdate,prepareTextPermission,type ResolvedService } from '../packages/sdk/src/ens/index';
import { registryAbi } from '../packages/sdk/src/ens/abi';
import { NETWORK,USDC,sameAddress } from '../packages/sdk/src/index';
config({path:'.env',quiet:true});
const required=['SEPOLIA_RPC_URL','SERVICE_ENS_NAME','ENS_OWNER_ADDRESS','ENS_OPERATOR_ADDRESS','MERCHANT_RESOURCE_URL','MERCHANT_PAY_TO'];
const missing=required.filter(key=>!process.env[key]);if(missing.length)throw new Error(`Missing setup values: ${missing.join(', ')}`);
const name=normalize(process.env.SERVICE_ENS_NAME!);if(name.includes(','))throw new Error('Prepare one service name per plan');
const owner=process.env.ENS_OWNER_ADDRESS! as Address,operator=process.env.ENS_OPERATOR_ADDRESS! as Address;
if(!sameAddress(owner,owner)||!sameAddress(operator,operator)||sameAddress(owner,operator))throw new Error('Use distinct valid owner and operator wallet addresses');
const client=createPublicClient({chain:sepolia,transport:http(process.env.SEPOLIA_RPC_URL!),ccipRead:false});
if(await client.getChainId()!==11155111)throw new Error('ENS setup requires Sepolia');
const block=await client.getBlock();
for(const [address,hash] of [[ensDeployment.universalResolver,ensDeployment.universalResolverCodeHash],[ensDeployment.factory,ensDeployment.factoryCodeHash],[ensDeployment.resolverImplementation,ensDeployment.resolverImplementationCodeHash]] as const){const code=await client.getCode({address,blockNumber:block.number});if(!code||keccak256(code)!==hash)throw new Error('ENS deployment changed; refresh integration before creating transactions');}
const dns=bytesToHex(packetToBytes(name));
let parent:Address=ensDeployment.rootRegistry;
const labels=name.split('.');
for(let i=labels.length-1;i>0;i--)parent=await client.readContract({address:parent,abi:currentRegistryAbi,functionName:'getSubregistry',args:[labels[i]!]});
const actualOwner=await client.readContract({address:parent,abi:currentRegistryAbi,functionName:'findOwner',args:[labels[0]!]});
if(!sameAddress(actualOwner,owner))throw new Error('Register the service name through app.ens.dev or the configured ServiceRegistrar first.');
const salt=BigInt(`0x${randomBytes(32).toString('hex')}`);
const initialization=encodeFunctionData({abi:resolverAbi,functionName:'initialize',args:[[{account:owner,roleBitmap:16n|(16n<<128n)}],[]]});
const deploy=await client.simulateContract({account:owner,address:ensDeployment.factory,abi:factoryAbi,functionName:'deployProxy',args:[ensDeployment.resolverImplementation,salt,initialization]});
const resolver=deploy.result;
const service={name,resolver,deployment:'current' as const};
const transactions=[
  {chainId:11155111,to:ensDeployment.factory,value:'0x0',data:encodeFunctionData({abi:factoryAbi,functionName:'deployProxy',args:[ensDeployment.resolverImplementation,salt,initialization]}),description:'Deploy a native ENSv2 PermissionedResolver with only root text writer and text administrator roles. No alias or upgrade role is assigned.'},
  prepareRecordUpdate(service,'agent-endpoint[x402]',process.env.MERCHANT_RESOURCE_URL!),
  prepareRecordUpdate(service,'ens402.payment',JSON.stringify({version:1,scheme:'exact',network:NETWORK,asset:USDC,payTo:process.env.MERCHANT_PAY_TO!})),
  prepareRecordUpdate(service,'ens402.status','active'),
  prepareTextPermission(service,'agent-endpoint[x402]',operator,true),
  {chainId:11155111,to:parent,value:'0x0',data:encodeFunctionData({abi:registryAbi,functionName:'setResolver',args:[BigInt(labelhash(name.split('.')[0]!)),resolver]}),description:'Point the registered service name at the configured native resolver. Publish this pointer last.'},
];
await mkdir('docs/setup',{recursive:true});
const plan={name,owner,operator,predictedResolver:resolver,sourceCommit:ensDeployment.sourceCommit,observedBlock:String(block.number),notes:['No transaction has been submitted. Review each operation and send them in order from the name owner.','This targets the pinned Sepolia deployment. Keep Treasury/admin separate from the endpoint operator.','The name owner and ancestor administrators can retain resolver-pointer authority.','Only deployment was simulated; later operations require the deployed resolver and native registry permissions.'],transactions};
await writeFile('docs/setup/ens-transactions.json',JSON.stringify(plan,null,2));
console.log('Prepared docs/setup/ens-transactions.json. No transaction submitted.');
