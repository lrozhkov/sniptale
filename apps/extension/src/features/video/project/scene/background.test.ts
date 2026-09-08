import { expect, it, vi } from 'vitest';
import {
  drawSceneBackground,
  getProjectSceneBackground,
  getProjectSceneBackgroundImageAssetId,
  getSceneBackgroundLegacyColor,
  syncProjectSceneBackground,
} from './background';
import { VideoSceneBackgroundKind } from '../types/index';

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

it('resolves image asset references and fallback colors', () => {
  expect(
    getProjectSceneBackgroundImageAssetId({
      backgroundColor: '#000000',
      sceneBackground: { kind: 'image', assetId: 'image-1' },
    })
  ).toBe('image-1');
  expect(
    getSceneBackgroundLegacyColor({
      assetId: 'image-1',
      kind: VideoSceneBackgroundKind.IMAGE,
    })
  ).toBe('#eef2f7');
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

it('draws canonical gradients through the scene entry point and forwards animation inputs', async () => {
  const { createSceneGradientBackground } = await import('./background-gradient');
  const background = createSceneGradientBackground();
  background.animation = { mode: 'rotate', speed: 80, intensity: 70 };
  const context = createContext();
  drawSceneBackground({ context, sceneBackground: background, width: 200, height: 100 });
  const initial = vi.mocked(context.createLinearGradient).mock.calls[0];
  drawSceneBackground({
    context,
    sceneBackground: background,
    width: 200,
    height: 100,
    currentTime: 3,
    audioEnvelope: 0.8,
  });
  expect(vi.mocked(context.createLinearGradient).mock.calls[1]).not.toEqual(initial);
  expect(context.fillRect).toHaveBeenCalledTimes(2);
});
