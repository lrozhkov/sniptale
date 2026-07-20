import { expect, it, vi } from 'vitest';
import { drawAnnotationBadge } from './parts';

function createContext() {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '#fff',
    fillText: vi.fn(),
    font: '',
    globalAlpha: 1,
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 24 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    textAlign: 'left',
    textBaseline: 'alphabetic',
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createClip() {
  return {
    content: { badge: 'NEW', headline: 'Headline', subline: 'Subline' },
    presentation: {
      effects: {
        badgeProgress: 1,
      },
      style: {
        accentColor: '#f97316',
        badgeTextColor: '#ffffff',
        padding: 16,
      },
    },
  };
}

it('scales badge typography and shell metrics with the preview display scale', () => {
  const context = createContext();

  const result = drawAnnotationBadge(
    context,
    createClip() as never,
    { showBadge: true },
    20,
    180,
    12,
    2
  );

  expect(result.badgeHeight).toBe(36.8);
  expect(context.font).toBe('700 24.00px "Segoe UI"');
  expect(context.fillText).toHaveBeenCalledWith('NEW', 54.2, 30.4);
});

it('scales annotation text reveal offsets with the preview display scale', () => {
  const context = createContext();

  drawAnnotationBadge(context, createClip() as never, { showBadge: false }, 20, 180, 12, 2);

  expect(context.scale).not.toHaveBeenCalledWith(0.9, 0.9);
});
