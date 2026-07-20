import { expect, it, vi } from 'vitest';
import { VideoOverlayTemplateKind } from '../../../project/types/index';
import { drawAnnotationBackground } from './surface';

function createContext() {
  return {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fill: vi.fn(),
    fillStyle: '#000000',
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createClip() {
  return {
    presentation: {
      effects: {
        shadowStrength: 1,
      },
      style: {
        borderRadius: 18,
        depthAmount: 0.35,
        padding: 16,
      },
    },
    templateKind: VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
  };
}

it('draws split lower-third surfaces with scaled shadow offsets and panel geometry', () => {
  const context = createContext();

  drawAnnotationBackground(context, createClip() as never, 20, 30, 240, 80, 20, 2);

  expect(context.fill).toHaveBeenCalledTimes(4);
  expect(context.moveTo).toHaveBeenCalledWith(39, 30);
  expect(context.quadraticCurveTo).toHaveBeenCalledWith(260, 30, 260, 66);
});
