export interface AiPickElementIndex {
  dataIdToElement: Map<string, HTMLElement>;
  elementToDataIds: Map<HTMLElement, Set<string>>;
  primaryElements: Set<HTMLElement>;
}

export function createAiPickElementIndex(): AiPickElementIndex {
  return {
    dataIdToElement: new Map<string, HTMLElement>(),
    elementToDataIds: new Map<HTMLElement, Set<string>>(),
    primaryElements: new Set<HTMLElement>(),
  };
}

export function resetAiPickElementIndex(index: AiPickElementIndex): void {
  index.dataIdToElement.clear();
  index.elementToDataIds.clear();
  index.primaryElements.clear();
}
