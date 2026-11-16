import type { GenerationIntent } from '../promptBuilder';

export interface CraftRule {
  slug: string;
  title: string;
  appliesTo: GenerationIntent[];
  body: string;
}
