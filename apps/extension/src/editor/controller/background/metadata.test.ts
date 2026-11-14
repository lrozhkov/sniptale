import { Rect } from 'fabric';
import { expect, it, vi } from 'vitest';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { createObjectLabel } from '../../document/model';
import {
  assignBackgroundMetadata,
  convertBackgroundDuplicateToAnnotation,
  preserveBackgroundLayerState,
} from './metadata';

function createFrame(patch: Partial<EditorFrameSettings> = {}): EditorFrameSettings {
  return {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundBlurAmount: 8,
    backgroundColor: '#112233',
    backgroundGradientAngle: 22,
    backgroundMode: 'gradient',
    ...patch,
  };
}

it('assigns frame metadata to managed background objects', () => {
  const background = new Rect({});

  assignBackgroundMetadata(background, createFrame());

  expect(background).toMatchObject({
    sniptaleBackgroundColor: '#112233',
    sniptaleBackgroundBlurAmount: 8,
    sniptaleBackgroundGradientAngle: 22,
    sniptaleBackgroundMode: 'gradient',
    sniptaleRole: 'background',
    sniptaleType: 'background',
  });
});

it('preserves previous background identity state when replacing layers', () => {
  const previous = new Rect({});
  previous.sniptaleId = 'existing-id';
  previous.sniptaleLabel = 'Existing';
  previous.sniptaleLocked = false;
  previous.visible = false;
  const next = new Rect({});

  preserveBackgroundLayerState(next, previous);

  expect(next.sniptaleId).toBe('existing-id');
  expect(next.sniptaleLabel).toBe('Existing');
  expect(next.sniptaleLocked).toBe(false);
  expect(next.visible).toBe(false);
});

it('creates default identity state for a new background layer', () => {
  const randomUUID = vi
    .spyOn(crypto, 'randomUUID')
    .mockReturnValue('00000000-0000-4000-8000-000000000000');
  const next = new Rect({});

  preserveBackgroundLayerState(next, undefined);

  expect(next.sniptaleId).toBe('00000000-0000-4000-8000-000000000000');
  expect(next.sniptaleLabel).toBe(createObjectLabel('background', 1));
  expect(next.sniptaleLocked).toBe(true);
  expect(next.visible).toBe(true);
  randomUUID.mockRestore();
});

it('converts duplicate backgrounds into annotations without background metadata', () => {
  const duplicate = new Rect({});
  duplicate.sniptaleRole = 'background';
  duplicate.sniptaleType = 'background';
  duplicate.sniptaleBackgroundMode = 'color';
  duplicate.sniptaleBackgroundBlurAmount = 4;
  duplicate.sniptaleBackgroundColor = '#112233';

  convertBackgroundDuplicateToAnnotation(duplicate);

  expect(duplicate.sniptaleRole).toBe('annotation');
  expect(duplicate.sniptaleType).toBe('shape');
  expect(duplicate.sniptaleBackgroundMode).toBeUndefined();
  expect(duplicate.sniptaleBackgroundBlurAmount).toBeUndefined();
  expect(duplicate.sniptaleBackgroundColor).toBeUndefined();
});

it('retains validated source crop only for the same managed image source', () => {
  const data = 'data:image/png;base64,QUJDRA==';
  const frame = createFrame({ backgroundMode: 'image', backgroundImageData: data });
  const previous = new Rect({});
  assignBackgroundMetadata(previous, frame);
  previous.sniptaleRasterOriginalData = data;
  previous.sniptaleRasterColorData = data;
  previous.sniptaleRasterVisibilityData = data;
  previous.sniptaleRasterKeyData = data;
  previous.sniptaleRasterState = {
    version: 1,
    width: 12,
    height: 8,
    crop: { x: 2, y: 1, width: 8, height: 6 },
  };
  const next = new Rect({});
  assignBackgroundMetadata(next, {
    ...frame,
    backgroundImageFit: 'tile',
    backgroundBlurAmount: 12,
  });
  preserveBackgroundLayerState(next, previous);
  expect(next.sniptaleRasterState).toEqual(previous.sniptaleRasterState);
  expect(next.sniptaleRasterOriginalData).toBe(data);
  expect(next.sniptaleRasterColorData).toBe(data);
  expect(next.sniptaleRasterVisibilityData).toBe(data);
  expect(next.sniptaleRasterKeyData).toBe(data);
  for (const changed of [
    { ...frame, backgroundImageData: 'data:image/png;base64,RUZHSA==' },
    { ...frame, backgroundMode: 'color' as const },
  ]) {
    assignBackgroundMetadata(next, changed);
    preserveBackgroundLayerState(next, previous);
    expect(next.sniptaleRasterState).toBeUndefined();
    expect(next.sniptaleRasterOriginalData).toBeUndefined();
  }
  previous.sniptaleRasterOriginalData = 'https://example.com/source.png';
  assignBackgroundMetadata(next, frame);
  preserveBackgroundLayerState(next, previous);
  expect(next.sniptaleRasterState).toBeUndefined();
});

it('preserves same-image native orientation/effects and clears them on replacement', () => {
  const previous = new Rect({ flipX: true, flipY: true });
  const frame = createFrame({
    backgroundMode: 'image',
    backgroundImageData: 'data:image/png;base64,QUJDRA==',
  });
  assignBackgroundMetadata(previous, frame);
  previous.sniptaleEffects = [{ id: 'brightness', enabled: true, amount: 0.3 }];
  previous.sniptaleContentLocked = false;
  const next = new Rect();
  assignBackgroundMetadata(next, { ...frame, backgroundImageFit: 'tile' });
  preserveBackgroundLayerState(next, previous);
  expect(next.flipX).toBe(true);
  expect(next.flipY).toBe(true);
  expect(next.sniptaleEffects).toEqual(previous.sniptaleEffects);
  expect(next.sniptaleContentLocked).toBe(false);
  assignBackgroundMetadata(next, {
    ...frame,
    backgroundImageData: 'data:image/png;base64,RUZHSA==',
  });
  preserveBackgroundLayerState(next, previous);
  expect(next.flipX).toBe(false);
  expect(next.flipY).toBe(false);
  expect(next.sniptaleEffects).toBeUndefined();
});
