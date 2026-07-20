import type { ScenarioDrawingDocument } from './types';

export function createEmptyScenarioDrawingDocument(slideId: string): ScenarioDrawingDocument {
  return {
    marks: [],
    slideId,
    version: 1,
  };
}

export function isScenarioDrawingDocumentEmpty(document: ScenarioDrawingDocument): boolean {
  return document.marks.length === 0;
}
