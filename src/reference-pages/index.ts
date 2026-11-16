export type {
  MotherCompositionHint,
  MotherDensity,
  MotherInjectionReceipt,
  MotherIngestIssue,
  MotherIngestResult,
  MotherInjectResult,
  MotherLicense,
  MotherMatchQuery,
  MotherOrigin,
  MotherPage,
  MotherPageKind,
  MotherPageMeta,
  MotherRegionExcerpt,
  MotherReview,
  MotherSelection,
  MotherSourceOnline,
  MotherStatus,
  MotherUiState
} from './types';

export {
  listActiveMothers,
  listInvalidBuiltinMothers,
  loadBuiltinMothers,
  getMotherById,
  __setCatalogForTests
} from './catalog';
export { computeMotherContentFingerprint } from './fingerprint';
export { matchMother, scoreMother, MOTHER_SCORE_THRESHOLD } from './retriever';
export { buildMotherReferenceExample, DEFAULT_MOTHER_INJECT_BUDGET } from './injector';
export { ingestMotherHtml, type MotherIngestInput } from './ingest';
export { listActiveBuiltinMotherMeta } from './builtinMetaIndex';
export {
  MOTHERS_DIR,
  MOTHERS_INDEX,
  draftMotherFromScreen,
  isSafeMotherId,
  listProjectLocalMothers,
  listUserGlobalMothers,
  loadProjectLocalMother,
  saveActiveScreenAsProjectMother,
  saveMotherProjectLocal,
  saveMotherUserGlobal,
  type DraftMotherFromScreenInput,
  type MotherIndexDocument,
  type MotherIndexEntry,
  type MotherSaveOrigin,
  type SaveMotherResult
} from './saveMother';
