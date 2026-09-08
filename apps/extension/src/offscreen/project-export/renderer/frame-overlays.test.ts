import { expect, it, vi, afterEach } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';
import { drawExportOverlayPass } from './frame-overlays';
const draw = vi.hoisted(() => ({ actions: vi.fn(), cursor: vi.fn() }));
vi.mock('../../../features/video/composition/draw', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/composition/draw')>()),
  drawSceneActionCompositionStates: draw.actions,
  drawCursorCompositionState: draw.cursor,
}));
afterEach(() => vi.clearAllMocks());

it.each([false, true])(
  'preserves resolved action identity and applies export raster/camera scaling, cursor=%s',
  (cursorVisible) => {
    const project = createEmptyVideoProject('Export overlays', 800, 600);
    project.duration = 3;
    project.actionEvents = [
      {
        id: 'click',
        kind: 'CLICK',
        anchor: { kind: 'project', time: 1 },
        point: { x: 100, y: 80 },
        label: 'Save',
        data: {},
      },
    ];
    const { overlayFrame } = resolveVideoCompositionRenderPasses(project, 1.2);
    expect(overlayFrame.actions).toHaveLength(1);
    overlayFrame.camera = { ...overlayFrame.camera, scale: 2, viewportX: 100, viewportY: 50 };
    overlayFrame.cursor = cursorVisible
      ? {
          animationPreset: 'NONE',
          captureMode: 'separate',
          color: '#fff',
          preset: 'ARROW',
          scale: 1.2,
          shadow: true,
          time: 1.2,
          visible: true,
          x: 130,
          y: 90,
        }
      : null;
    const context = {} as CanvasRenderingContext2D;
    drawExportOverlayPass(context, overlayFrame, 0.5, 0.25);
    expect(draw.actions).toHaveBeenCalledWith(context, overlayFrame.actions, overlayFrame.camera, {
      offsetX: 0,
      offsetY: 0,
      scaleX: 0.5,
      scaleY: 0.25,
    });
    expect(draw.actions.mock.calls[0]?.[1]).toBe(overlayFrame.actions);
    if (cursorVisible)
      expect(draw.cursor).toHaveBeenCalledWith(
        context,
        expect.objectContaining({ x: 30, y: 20, scale: expect.closeTo(0.9, 12) })
      );
    else expect(draw.cursor).not.toHaveBeenCalled();
  }
);
