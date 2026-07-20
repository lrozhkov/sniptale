// @vitest-environment jsdom
import { Point } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSelectionMaskForSnapshot: vi.fn(() => document.createElement('canvas')),
  finalizeSelectionMask: vi.fn(() => true),
  notifyEditorRasterOverlay: vi.fn(),
  replaceRasterMaskWithPolygon: vi.fn(),
  replaceRasterMaskWithRect: vi.fn(),
  resolveBitmapPoint: vi.fn(() => ({ x: 8, y: 9 })),
  resolveRasterOverlayObject: vi.fn(() => ({ id: 'overlay' })),
}));

vi.mock('../shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared')>()),
  createSelectionMaskForSnapshot: mocks.createSelectionMaskForSnapshot,
  finalizeSelectionMask: mocks.finalizeSelectionMask,
}));

vi.mock('../session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../session')>()),
  notifyEditorRasterOverlay: mocks.notifyEditorRasterOverlay,
}));

vi.mock('../../raster/selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/selection')>()),
  replaceRasterMaskWithPolygon: mocks.replaceRasterMaskWithPolygon,
  replaceRasterMaskWithRect: mocks.replaceRasterMaskWithRect,
}));

vi.mock('../../raster/target', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/target')>()),
  resolveBitmapPoint: mocks.resolveBitmapPoint,
}));

vi.mock('../../raster/object', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../raster/object')>()),
  resolveRasterOverlayObject: mocks.resolveRasterOverlayObject,
}));

import { createEditorRasterToolSession } from '../session';
import {
  finalizeLassoDraft,
  finalizeMarqueeDraft,
  updateLassoDraft,
  updateMarqueeDraft,
} from './draft';

function createSnapshot() {
  const bitmap = document.createElement('canvas');
  bitmap.width = 20;
  bitmap.height = 30;
  return {
    bitmap,
    reference: { kind: 'object', objectId: 'layer-1', objectName: 'Layer 1' },
    sceneBounds: { left: 0, top: 0, width: 20, height: 30 },
  };
}

function registerDraftUpdateTests() {
  it('updates marquee and lasso drafts through bitmap point resolution', () => {
    const session = createEditorRasterToolSession();
    session.marqueeDraft = {
      snapshot: createSnapshot() as never,
      startBitmapPoint: { x: 1, y: 2 },
      currentBitmapPoint: { x: 1, y: 2 },
    };
    expect(updateMarqueeDraft(session, {} as never, null, new Point(3, 4))).toBe(true);
    expect(session.marqueeDraft.currentBitmapPoint).toEqual({ x: 8, y: 9 });

    session.lassoDraft = {
      snapshot: createSnapshot() as never,
      bitmapPoints: [{ x: 8, y: 9 }],
      scenePoints: [new Point(1, 1)],
    };
    expect(updateLassoDraft(session, {} as never, null, new Point(5, 6))).toBe(true);
    expect(session.lassoDraft.bitmapPoints).toHaveLength(1);
  });
}

function registerDraftFinalizeTests() {
  it('finalizes marquee and lasso drafts into selection masks', () => {
    const session = createEditorRasterToolSession();
    session.marqueeDraft = {
      snapshot: createSnapshot() as never,
      startBitmapPoint: { x: 10, y: 12 },
      currentBitmapPoint: { x: 2, y: 3 },
    };
    expect(finalizeMarqueeDraft(session)).toBe(true);
    expect(mocks.replaceRasterMaskWithRect).toHaveBeenCalledWith(expect.anything(), {
      left: 2,
      top: 3,
      width: 8,
      height: 9,
    });

    session.lassoDraft = {
      snapshot: createSnapshot() as never,
      bitmapPoints: [{ x: 1, y: 2 }],
      scenePoints: [new Point(1, 1)],
    };
    expect(finalizeLassoDraft(session)).toBe(true);
    expect(mocks.replaceRasterMaskWithPolygon).toHaveBeenCalledWith(expect.anything(), [
      { x: 1, y: 2 },
    ]);
  });
}

function runSelectionDraftSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveBitmapPoint.mockReturnValue({ x: 8, y: 9 });
  });

  registerDraftUpdateTests();
  registerDraftFinalizeTests();
}

describe('raster selection draft owner', runSelectionDraftSuite);
