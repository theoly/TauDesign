import { finalizeModelHtml } from './modelHtmlResult';

/** Extract a complete HTML artifact for restyle; never accept a truncated stream. */
export function extractRestyleHtml(raw: string): string | null {
  return finalizeModelHtml({ rawResponse: raw, continuationCount: 0, warnings: [] }, { allowRawFragment: true }).html ?? null;
}
