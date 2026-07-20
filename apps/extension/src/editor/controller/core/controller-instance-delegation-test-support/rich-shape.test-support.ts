import { vi } from 'vitest';

const richShapeMocks = vi.hoisted(() => ({
  insertEditorControllerRichShape: vi.fn(),
}));

export function getRichShapeMocks() {
  return richShapeMocks;
}

vi.mock('../../public-api/rich-shape-insertion', () => ({
  insertEditorControllerRichShapeWithOptions: richShapeMocks.insertEditorControllerRichShape,
}));
