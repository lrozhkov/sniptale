import { useMemo } from 'react';
import { createEmptyScenarioDrawingDocument } from './model';

export function useScenarioDrawingDocument(slideId: string) {
  return useMemo(() => createEmptyScenarioDrawingDocument(slideId), [slideId]);
}
