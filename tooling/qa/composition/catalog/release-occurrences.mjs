import { collectQaOccurrences } from './catalog.mjs';

export function createReleaseControlOccurrences() {
  return [
    ...collectQaOccurrences({ lane: 'release-direct' }),
    ...collectQaOccurrences({ lane: 'release-guardrail' }),
  ];
}
