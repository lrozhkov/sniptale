import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createObjectLabel: vi.fn(() => 'pencil-2'),
  createFabricShadow: vi.fn(() => ({ blur: 10 })),
  hexToRgba: vi.fn(() => 'rgba(0, 0, 0, 0.5)'),
  updateArrowPointOnDoubleClick: vi.fn(),
}));

vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  createObjectLabel: mocks.createObjectLabel,
  hexToRgba: mocks.hexToRgba,
}));
vi.mock('../../objects/shadow', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shadow')>('../../objects/shadow')),
  createFabricShadow: mocks.createFabricShadow,
}));

vi.mock('../../objects/arrow', async () => ({
  ...(await vi.importActual<typeof import('../../objects/arrow')>('../../objects/arrow')),
  updateArrowPointOnDoubleClick: mocks.updateArrowPointOnDoubleClick,
}));

import { configureEditorFreehandPath, updateEditorArrowOnDoubleClick } from './interactions';

function createFreehandPath() {
  return {
    set: vi.fn(),
  } as {
    sniptaleId?: string;
    sniptaleBrushPointsJson?: string;
    sniptaleBrushShadow?: number;
    sniptaleBrushSmoothing?: number;
    sniptaleBrushDynamicWidth?: boolean;
    sniptaleBrushWidth?: number;
    sniptaleLabel?: string;
    sniptaleRole?: string;
    sniptaleType?: string;
    set: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-2' });
});

it('configures freehand paths with editor metadata and brush styling', () => {
  const path = createFreehandPath();

  configureEditorFreehandPath({
    brush: {
      consumeCommittedPoints: () => [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
    } as never,
    labelIndex: 2,
    path: path as never,
    settings: {
      color: '#000000',
      opacity: 0.5,
      shadow: 30,
      smoothingLevel: 6,
      width: 8,
    } as never,
    tool: 'pencil',
  });

  expect(path.sniptaleId).toBe('uuid-2');
  expect(path.sniptaleType).toBe('pencil');
  expect(path.sniptaleRole).toBe('annotation');
  expect(path.sniptaleLabel).toBe('pencil-2');
  expect(path.sniptaleBrushPointsJson).toBe('[{"x":1,"y":2},{"x":3,"y":4}]');
  expect(path.sniptaleBrushShadow).toBe(30);
  expect(path.sniptaleBrushSmoothing).toBe(6);
  expect(path.sniptaleBrushDynamicWidth).toBe(false);
  expect(path.sniptaleBrushWidth).toBe(8);
  expect(path.set).toHaveBeenCalledWith({
    fill: '',
    objectCaching: false,
    opacity: 1,
    shadow: { blur: 10 },
    stroke: 'rgba(0, 0, 0, 0.5)',
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    strokeUniform: true,
    strokeWidth: 8,
  });
});

it('routes arrow double clicks through the owner-local arrow interaction seam', () => {
  const point = { x: 4, y: 5 } as never;
  const target = { id: 'arrow' } as never;

  updateEditorArrowOnDoubleClick(target, point);
  expect(mocks.updateArrowPointOnDoubleClick).toHaveBeenCalledWith(target, point);
});
