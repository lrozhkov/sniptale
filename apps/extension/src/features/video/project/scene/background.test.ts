import { expect, it, vi } from 'vitest';
import {
  drawSceneBackground,
  getProjectSceneBackground,
  getProjectSceneBackgroundImageAssetId,
  getSceneBackgroundLegacyColor,
  getSceneBackgroundStyle,
  resolveSceneBackgroundFrame,
  syncProjectSceneBackground,
} from './background';
import { VideoSceneBackgroundKind, VideoSceneGradientAnimationMode } from '../types/index';

function createContext() {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    set fillStyle(_value: unknown) {},
  } as unknown as CanvasRenderingContext2D;
}

it('normalizes legacy solid backgrounds and syncs the legacy color field', () => {
  const project = { backgroundColor: '#101010' };
  const sceneBackground = getProjectSceneBackground(project);

  expect(sceneBackground).toEqual({
    color: '#101010',
    kind: VideoSceneBackgroundKind.SOLID,
  });
  expect(syncProjectSceneBackground(project, sceneBackground)).toEqual({
    backgroundColor: '#101010',
    sceneBackground,
  });
});

it('normalizes gradients and invalid image backgrounds against the fallback color', () => {
  expect(
    getProjectSceneBackground({
      backgroundColor: '#202020',
      sceneBackground: {
        angle: -45,
        from: '',
        kind: VideoSceneBackgroundKind.GRADIENT,
        to: '',
      },
    })
  ).toEqual({
    angle: 315,
    from: '#202020',
    kind: VideoSceneBackgroundKind.GRADIENT,
    stops: [
      { color: '#202020', offset: 0 },
      { color: '#202020', offset: 1 },
    ],
    to: '#202020',
  });
  expect(
    getProjectSceneBackground({
      backgroundColor: '#202020',
      sceneBackground: { assetId: '', kind: VideoSceneBackgroundKind.IMAGE },
    })
  ).toEqual({
    color: '#202020',
    kind: VideoSceneBackgroundKind.SOLID,
  });
});

it('resolves gradient styles and image asset ids', () => {
  expect(
    getSceneBackgroundStyle({
      angle: 90,
      from: '#111111',
      kind: VideoSceneBackgroundKind.GRADIENT,
      stops: [
        { color: '#111111', offset: 0 },
        { color: '#f97316', offset: 0.5 },
        { color: '#222222', offset: 1 },
      ],
      to: '#222222',
    })
  ).toEqual({
    background: 'linear-gradient(90deg, #111111 0%, #f97316 50%, #222222 100%)',
  });
  expect(
    getProjectSceneBackgroundImageAssetId({
      backgroundColor: '#000000',
      sceneBackground: { assetId: 'image-1', kind: VideoSceneBackgroundKind.IMAGE },
    })
  ).toBe('image-1');
  expect(
    getProjectSceneBackgroundImageAssetId({
      backgroundColor: '#000000',
      sceneBackground: { color: '#101010', kind: VideoSceneBackgroundKind.SOLID },
    })
  ).toBeNull();
});

it('resolves animated gradients deterministically for style and canvas output', () => {
  const background = {
    angle: 90,
    animation: {
      mode: VideoSceneGradientAnimationMode.ROTATE,
      speed: 10,
      intensity: 20,
    },
    from: '#111111',
    kind: VideoSceneBackgroundKind.GRADIENT,
    stops: [
      { color: '#111111', offset: 0 },
      { color: '#f97316', offset: 0.5, opacity: 0.5 },
      { color: '#222222', offset: 1 },
    ],
    to: '#222222',
  } as const;
  const context = createContext();

  expect(resolveSceneBackgroundFrame({ sceneBackground: background, time: 2 })).toMatchObject({
    angle: expect.closeTo(91.7, 1),
    fromStop: expect.closeTo(2.1, 1),
    toStop: expect.closeTo(98.7, 1),
  });
  const style = getSceneBackgroundStyle(background, undefined, { time: 2 });
  expect('background' in style ? style.background : '').toContain('linear-gradient(91.');

  drawSceneBackground({
    context,
    currentTime: 2,
    height: 100,
    sceneBackground: background,
    width: 200,
  });

  expect(context.createLinearGradient).toHaveBeenCalled();
});

it('modulates audio-reactive gradients from an explicit envelope', () => {
  expect(
    resolveSceneBackgroundFrame({
      audioEnvelope: 0.5,
      sceneBackground: {
        angle: 45,
        animation: {
          mode: VideoSceneGradientAnimationMode.AUDIO_REACTIVE,
          speed: 40,
          intensity: 80,
        },
        from: '#101010',
        kind: VideoSceneBackgroundKind.GRADIENT,
        to: '#f8fafc',
      },
    })
  ).toMatchObject({
    angle: expect.closeTo(74.8, 1),
    fromStop: expect.closeTo(11.5, 1),
    toStop: expect.closeTo(88.5, 1),
  });
});

it('resolves image styles and legacy fallback colors', () => {
  expect(
    getSceneBackgroundStyle(
      {
        assetId: 'image-1',
        kind: VideoSceneBackgroundKind.IMAGE,
      },
      'blob:hero'
    )
  ).toEqual(
    expect.objectContaining({
      backgroundImage: 'url("blob:hero")',
      backgroundSize: 'cover',
    })
  );
  expect(
    getSceneBackgroundStyle({
      assetId: 'image-1',
      kind: VideoSceneBackgroundKind.IMAGE,
    })
  ).toEqual({
    background: '#eef2f7',
  });
  expect(
    getSceneBackgroundLegacyColor({
      assetId: 'image-1',
      kind: VideoSceneBackgroundKind.IMAGE,
    })
  ).toBe('#eef2f7');
});

it('draws solid and gradient backgrounds through the canvas seam', () => {
  const context = createContext();

  drawSceneBackground({
    context,
    height: 100,
    sceneBackground: { color: '#abcdef', kind: VideoSceneBackgroundKind.SOLID },
    width: 200,
  });
  drawSceneBackground({
    context,
    height: 100,
    sceneBackground: {
      angle: 135,
      from: '#111111',
      kind: VideoSceneBackgroundKind.GRADIENT,
      stops: [
        { color: '#111111', offset: 0 },
        { color: '#f97316', offset: 0.5 },
        { color: '#333333', offset: 1 },
      ],
      to: '#333333',
    },
    width: 200,
  });

  const gradient = vi.mocked(context.createLinearGradient).mock.results[0]?.value;

  expect(context.fillRect).toHaveBeenCalled();
  expect(gradient?.addColorStop).toHaveBeenCalledWith(0, '#111111');
  expect(gradient?.addColorStop).toHaveBeenCalledWith(0.5, '#f97316');
});

it('fills the image fallback color and draws loaded images when available', () => {
  const context = createContext();

  drawSceneBackground({
    context,
    height: 100,
    sceneBackground: { assetId: 'missing', kind: VideoSceneBackgroundKind.IMAGE },
    width: 200,
  });
  drawSceneBackground({
    context,
    height: 100,
    loadedImages: {
      hero: {
        naturalHeight: 50,
        naturalWidth: 25,
      } as HTMLImageElement,
    },
    sceneBackground: { assetId: 'hero', kind: VideoSceneBackgroundKind.IMAGE },
    width: 200,
  });

  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
  expect(context.drawImage).toHaveBeenCalled();
});
