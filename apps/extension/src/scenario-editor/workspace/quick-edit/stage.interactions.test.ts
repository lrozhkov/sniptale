import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUuid = '00000000-0000-0000-0000-000000000001';

vi.stubGlobal('crypto', { randomUUID: vi.fn(() => mockUuid) });

import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { resolveScenarioStageLayout } from '../../../features/scenario/stage/layout';
import { buildQuickEditDragPatch, createOverlayFromTool } from './stage.interactions';

function createStep() {
  return createScenarioCaptureStep({
    assetId: 'asset-1',
    body: 'Body',
    overlays: [],
    title: 'Step',
  });
}

function createLayout(step = createStep()) {
  return resolveScenarioStageLayout(step, { width: 1280, height: 720 });
}

function createOwnedOverlayStep() {
  const step = createStep();
  const textOverlay = {
    id: 'text-overlay',
    kind: 'text',
    point: { x: 100, y: 120 },
    text: 'Text',
    color: '#111827',
    fontFamily: 'system-ui',
    fontSize: 24,
    fontWeight: 600,
  } as const;
  const rectOverlay = {
    id: 'rect-overlay',
    kind: 'rectangle',
    rect: { x: 120, y: 140, width: 80, height: 60 },
    strokeColor: '#000',
    fillColor: 'transparent',
    strokeWidth: 2,
  } as const;
  const arrowOverlay = {
    id: 'arrow-overlay',
    kind: 'arrow',
    start: { x: 100, y: 140 },
    end: { x: 220, y: 180 },
    color: '#f97316',
    strokeWidth: 4,
  } as const;

  return {
    arrowOverlay,
    overlayStep: { ...step, overlays: [textOverlay, rectOverlay, arrowOverlay] },
    rectOverlay,
    textOverlay,
  };
}

function createOwnedOverlayPatches() {
  const owned = createOwnedOverlayStep();
  const layout = createLayout(owned.overlayStep)!;

  return {
    ...owned,
    arrowPatch: buildQuickEditDragPatch(
      {
        kind: 'move-arrow-endpoint',
        endpoint: 'end',
        origin: { x: 0, y: 0 },
        overlayId: owned.arrowOverlay.id,
        snapshot: owned.overlayStep,
      },
      layout,
      { clientX: 20, clientY: 10 } as PointerEvent
    ),
    movePatch: buildQuickEditDragPatch(
      {
        kind: 'move-overlay',
        origin: { x: 0, y: 0 },
        overlayId: owned.textOverlay.id,
        snapshot: owned.overlayStep,
      },
      layout,
      { clientX: 20, clientY: 10 } as PointerEvent
    ),
    resizePatch: buildQuickEditDragPatch(
      {
        kind: 'resize-overlay',
        handle: 'se',
        origin: { x: 0, y: 0 },
        overlayId: owned.rectOverlay.id,
        snapshot: owned.overlayStep,
      },
      layout,
      { clientX: 20, clientY: 10 } as PointerEvent
    ),
  };
}

function expectOwnedOverlayPatches(patches: ReturnType<typeof createOwnedOverlayPatches>) {
  expect(
    (patches.movePatch?.overlays?.[0] as typeof patches.textOverlay | undefined)?.point
  ).not.toEqual(patches.textOverlay.point);
  expect(
    (
      patches.resizePatch?.overlays?.find((overlay) => overlay.id === patches.rectOverlay.id) as
        | typeof patches.rectOverlay
        | undefined
    )?.rect.width
  ).toBeGreaterThan(patches.rectOverlay.rect.width);
  expect(
    (
      patches.resizePatch?.overlays?.find((overlay) => overlay.id === patches.rectOverlay.id) as
        | typeof patches.rectOverlay
        | undefined
    )?.rect.height
  ).toBeGreaterThan(patches.rectOverlay.rect.height);
  expect(
    (
      patches.arrowPatch?.overlays?.find((overlay) => overlay.id === patches.arrowOverlay.id) as
        | typeof patches.arrowOverlay
        | undefined
    )?.end
  ).not.toEqual(patches.arrowOverlay.end);
}

function expectCreatedOverlaySideEffects(args: {
  onActiveToolChange: ReturnType<typeof vi.fn>;
  onSelectOverlay: ReturnType<typeof vi.fn>;
  onStepChange: ReturnType<typeof vi.fn>;
  setDragState: ReturnType<typeof vi.fn>;
}) {
  expect(args.onStepChange).toHaveBeenCalledWith({
    overlays: [
      expect.objectContaining({
        id: mockUuid,
        kind: 'arrow',
      }),
    ],
  });
  expect(args.onSelectOverlay).toHaveBeenCalledWith(mockUuid);
  expect(args.setDragState).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: 'move-arrow-endpoint',
      endpoint: 'end',
      overlayId: mockUuid,
    })
  );
  expect(args.onActiveToolChange).toHaveBeenCalledWith('select');
}

beforeEach(() => {
  vi.mocked(crypto.randomUUID).mockReturnValue(mockUuid);
});

describe('quick-edit stage interactions drag patches', () => {
  it('builds pan drag patches and returns null for missing overlay ids', () => {
    const step = createStep();
    const layout = createLayout(step);

    expect(
      buildQuickEditDragPatch(
        {
          kind: 'pan',
          origin: { x: 20, y: 40 },
          snapshot: step,
        },
        layout!,
        { clientX: 35, clientY: 70 } as PointerEvent
      )
    ).toEqual({
      imageTransform: {
        ...step.imageTransform,
        x: 15,
        y: 30,
      },
    });

    expect(
      buildQuickEditDragPatch(
        {
          kind: 'move-overlay',
          origin: { x: 0, y: 0 },
          overlayId: 'missing',
          snapshot: step,
        },
        layout!,
        { clientX: 20, clientY: 10 } as PointerEvent
      )
    ).toBeNull();
  });

  it('builds move, resize, and arrow-endpoint patches for owned overlays', () => {
    expectOwnedOverlayPatches(createOwnedOverlayPatches());
  });
});

describe('quick-edit stage interactions overlay creation', () => {
  it('creates overlays from the active tool and selects the owned overlay immediately', () => {
    const step = createStep();
    const layout = createLayout(step)!;
    const onActiveToolChange = vi.fn();
    const onSelectOverlay = vi.fn();
    const onStepChange = vi.fn();
    const setDragState = vi.fn();
    const event = { clientX: 30, clientY: 40 } as never;

    createOverlayFromTool({
      activeTool: 'arrow',
      event,
      layout,
      onActiveToolChange,
      onSelectOverlay,
      onStepChange,
      setDragState,
      stagePoint: { x: 100, y: 120 },
      step,
    });

    expectCreatedOverlaySideEffects({
      onActiveToolChange,
      onSelectOverlay,
      onStepChange,
      setDragState,
    });
  });
});
