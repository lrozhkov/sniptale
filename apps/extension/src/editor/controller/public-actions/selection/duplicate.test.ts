import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createObjectLabelMock: vi.fn((type: string, index: number) => `${type}-${index}`),
  isEditableObjectMock: vi.fn(() => true),
  isSourceObjectMock: vi.fn((object: { role?: string }) => object.role === 'source'),
}));

vi.mock('fabric', () => ({
  ActiveSelection: class ActiveSelection {
    constructor(
      public objects: unknown[],
      public options: Record<string, unknown>
    ) {}
  },
  Path: class Path {
    constructor(public path: Array<Array<string | number>> = []) {}
  },
  PencilBrush: class PencilBrush {},
  Point: class Point {
    constructor(
      public x = 0,
      public y = 0
    ) {}
  },
}));
vi.mock('../../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../../document/model')>('../../../document/model');
  return {
    ...actual,
    CUSTOM_JSON_PROPS: ['sniptaleId', 'sniptaleType'],
    createObjectLabel: mocks.createObjectLabelMock,
    isEditableObject: mocks.isEditableObjectMock,
    isSourceObject: mocks.isSourceObjectMock,
  };
});

import { duplicateEditorSelection } from './objects';

function createClone(initialType: string) {
  return {
    left: 2,
    sniptaleType: initialType,
    set: vi.fn(function setCloneValues(
      this: Record<string, unknown>,
      values: Record<string, unknown>
    ) {
      Object.assign(this, values);
      return this;
    }),
    top: 3,
  } as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('duplicates current selection and relabels source clones as images', async () => {
  const cloneA = createClone('shape');
  const cloneB = createClone('image');
  const originalA = {
    clone: vi.fn(async () => cloneA),
    id: 'one',
    sniptaleRichShape: { id: 'old-rich-shape' },
    role: 'annotation',
  };
  const originalB = { clone: vi.fn(async () => cloneB), id: 'two', role: 'source' };
  const canvas = {
    add: vi.fn(),
    getActiveObjects: () => [originalA, originalB],
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const originalRandomUuid = crypto.randomUUID;
  crypto.randomUUID = vi.fn(() => 'uuid-1') as never;

  try {
    await duplicateEditorSelection({
      canvas: canvas as never,
      commitHistory: vi.fn(),
      nextLabelIndex: (type) => (type === 'image' ? 7 : 4),
      prepareObject: vi.fn(),
      syncRuntimeState: vi.fn(),
    });
  } finally {
    crypto.randomUUID = originalRandomUuid;
  }

  expect(cloneA['sniptaleLabel']).toBe('shape-4');
  expect(cloneA['sniptaleRichShape']).toEqual({ id: 'uuid-1' });
  expect(cloneB['sniptaleLabel']).toBe('image-7');
  expect(cloneB['sniptaleRole']).toBe('annotation');
  expect(cloneB['sniptaleType']).toBe('image');
  expect(canvas.add).toHaveBeenCalledTimes(2);
  expect(canvas.setActiveObject).toHaveBeenCalledOnce();
});

it('does not duplicate locked selections', async () => {
  const original = {
    clone: vi.fn(async () => createClone('shape')),
    id: 'locked',
    sniptaleLocked: true,
    role: 'annotation',
  };
  const canvas = {
    add: vi.fn(),
    getActiveObjects: () => [original],
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();

  await duplicateEditorSelection({
    canvas: canvas as never,
    commitHistory,
    nextLabelIndex: vi.fn(() => 1),
    prepareObject: vi.fn(),
    syncRuntimeState,
  });

  expect(original.clone).not.toHaveBeenCalled();
  expect(canvas.add).not.toHaveBeenCalled();
  expect(commitHistory).not.toHaveBeenCalled();
  expect(syncRuntimeState).not.toHaveBeenCalled();
});
