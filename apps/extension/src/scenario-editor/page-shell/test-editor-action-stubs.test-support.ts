import { vi } from 'vitest';

export function createScenarioV3ElementActionStubs(
  overrides: { selectElement?: (elementId: string) => void } = {}
) {
  return {
    deleteElement: vi.fn(),
    insertElement: vi.fn(),
    insertElementAtPoint: vi.fn(),
    insertElementFromDrag: vi.fn(),
    insertImageFile: vi.fn(),
    moveElement: vi.fn(),
    selectElement: overrides.selectElement ?? vi.fn(),
    selectSlideSurface: vi.fn(),
    updateElement: vi.fn(),
  };
}

export function createScenarioV3SlideActionStubs() {
  return {
    addSlide: vi.fn(),
    addTemplateSlide: vi.fn(),
    deleteSlide: vi.fn(),
    duplicateSlide: vi.fn(),
    moveSlide: vi.fn(),
    replaceSelectedSlide: vi.fn(),
    selectSlide: vi.fn(),
    updateSlide: vi.fn(),
  };
}
