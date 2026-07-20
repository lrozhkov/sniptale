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
  duplicate.sniptaleBackgroundColor = '#112233';

  convertBackgroundDuplicateToAnnotation(duplicate);

  expect(duplicate.sniptaleRole).toBe('annotation');
  expect(duplicate.sniptaleType).toBe('rectangle');
  expect(duplicate.sniptaleBackgroundMode).toBeUndefined();
  expect(duplicate.sniptaleBackgroundColor).toBeUndefined();
});
