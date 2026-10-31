import {expect,test} from 'bun:test';
import {runDesignProtocolDryRun} from '../scripts/lib/designProtocolDryRun';
test('controlled protocol report verifies both devices through real core requests and keeps every started arm in its budget totals',async()=>{
 const report=await runDesignProtocolDryRun();expect(report.passed).toBe(true);expect(report.rows).toHaveLength(16);
 for(const row of report.rows){
  expect(row.status).toBe('passed');expect(row.contextual!.requests).toBe(row.baseline!.requests);expect(row.contextual!.inputChars).toBeLessThanOrEqual(row.baseline!.inputChars);expect(row.contextual!.requestedOutputTokens).toBe(row.baseline!.requestedOutputTokens);
  expect(row.rules!.length).toBeGreaterThan(0);expect(row.messageSha256).toHaveLength(row.contextual!.requests);expect(row.schemaSha256!.every(s=>/^[a-f0-9]{64}$/.test(s))).toBe(true);
 }
 for(const device of ['mobile','pc']){
  const html=report.rows.find(r=>r.id===`${device}-html`)!;expect(html.contextual!.requests).toBe(2);expect(html.receipts).toBe(1);expect(html.contextual!.requestedOutputTokens).toBe(11264);
  const continued=report.rows.find(r=>r.id===`${device}-continuation`)!;expect(continued.contextual!.requests).toBe(3);expect(continued.receipts).toBe(2);expect(continued.contextual!.requestedOutputTokens).toBe(19456);
  expect(report.rows.find(r=>r.id===`${device}-finite-json`)!.contextual!.requestedOutputTokens).toBe(2048);
  expect(report.rows.find(r=>r.id===`${device}-fragment-json`)!.contextual!.requestedOutputTokens).toBe(4096);
  expect(report.rows.find(r=>r.id===`${device}-supplement-json`)!.contextual!.requestedOutputTokens).toBe(1800);
 }
 expect(JSON.stringify(report)).not.toContain('SYNTHETIC_NOT_A_CREDENTIAL');
});
