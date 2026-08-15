import type { AnnotationSessionDefaults } from '@sniptale/runtime-contracts/highlighter/border-preset';

import { isBoolean, isPlainRecord } from './primitives';

export function parseAnnotationSessionDefaults(value: unknown): AnnotationSessionDefaults | null {
  if (!isPlainRecord(value) || !isBoolean(value['enabled'])) return null;
  const templateSource = value['templateSource'];
  if (templateSource !== 'frame-default' && templateSource !== 'forced') return null;
  return { enabled: value['enabled'], templateSource };
}
