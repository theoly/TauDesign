import {expect,test} from 'bun:test';
import {targetRuleFeatures,pageRuleFeatures} from '../src/services/ai/designKnowledge/targetFeatures';
const html='<main data-nid="root0001"><section data-nid="region01"><button class="btn" data-nid="notify01"><svg class="icon"></svg><span class="badge-count">3</span></button><input/><select></select><span class="chip">标签</span><img/><p>'+('正文'.repeat(50))+'</p></section><div data-nid="unknown1">普通容器</div></main>';
test('known semantics come only from the exact authorized subtree, including SVG-safe attributes',()=>{
 expect(targetRuleFeatures(html,['notify01'])).toEqual(['badge','button','icon']);
 expect(targetRuleFeatures(html,['region01'])).toEqual(['badge','button','form','icon','long-copy','media','tags']);
 expect(targetRuleFeatures(html,['unknown1'])).toEqual([]);
 expect(pageRuleFeatures(html)).toEqual(['badge','button','form','icon','long-copy','media','tags']);
});
test('missing, ambiguous, repeated or empty roots never borrow semantics from the rest of the page',()=>{
 for(const ids of [[],['missing'],['notify01','notify01'],['notify01','missing']])expect(targetRuleFeatures(html,ids)).toEqual([]);
 expect(targetRuleFeatures(html+'<div data-nid="notify01"></div>',['notify01'])).toEqual([]);
});
test('class substrings and visible words do not manufacture native button/badge features',()=>{
 expect(targetRuleFeatures('<div data-nid="plain001" class="not-a-badge custom-button">button、角标、form、长正文</div>',['plain001'])).toEqual([]);
});
