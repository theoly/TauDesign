/** Wait for a concrete async boundary (storage/crypto/React), never assume one timer turn is enough. */
export async function waitUntil(check:()=>boolean,timeoutMs=2000):Promise<void>{
 const end=Date.now()+timeoutMs;while(!check()){if(Date.now()>=end)throw Error('Timed out waiting for the expected async test boundary');await new Promise(resolve=>setTimeout(resolve,1));}
}
