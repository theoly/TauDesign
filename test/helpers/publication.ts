import {getProjectPublication} from '../../src/services/storage/projectPublication';
import {useProjectStore} from '../../src/stores/useProjectStore';
/** Observe the real asynchronous publication; never release its lock from a test. */
export async function waitForPublicationIdle(){
 const deadline=Date.now()+4000;
 do{await new Promise(resolve=>setTimeout(resolve,1));if(!getProjectPublication()&&useProjectStore.getState().stagedAdoptionStatus!=='saving')return;}while(Date.now()<deadline);
 throw Error('设计发布未结束：'+(useProjectStore.getState().stagedAdoptionError??getProjectPublication()?.label??'等待交付收尾'));
}
