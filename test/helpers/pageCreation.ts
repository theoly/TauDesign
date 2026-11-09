import {beforeEach,afterEach} from 'bun:test';
import {PageRenderCheck} from '../../src/services/ai/pageRenderCheck';
import {resourceRenderReport} from './renderResourceProof';
/** For store/route unit tests only. Actual rendering is separately covered in browser scripts. */
export function stubPageCreationRender() {
  let original:typeof PageRenderCheck.inspect;
  beforeEach(()=>{original=PageRenderCheck.inspect;PageRenderCheck.inspect=(request,storage)=>resourceRenderReport(request,storage,{status:'complete',findings:[],inspected:3});});
  afterEach(()=>{PageRenderCheck.inspect=original;});
}
