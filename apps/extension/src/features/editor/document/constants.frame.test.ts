import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
  DEFAULT_EDITOR_IMAGE_SETTINGS,
  normalizeBrowserFrameState,
  normalizeEditorFrameSettings,
} from './constants';
import type { EditorFrameSettings } from './types';

function assertFrameDefaultsForMissingInput(): void {
  expect(normalizeEditorFrameSettings(null)).toEqual(DEFAULT_EDITOR_FRAME_SETTINGS);
  expect(normalizeEditorFrameSettings(undefined)).toEqual(DEFAULT_EDITOR_FRAME_SETTINGS);
}

function assertExplicitFalseyFrameValues(): void {
  expect(normalizeEditorFrameSettings(createExplicitFalseyFrameInput())).toEqual({
    backgroundColor: '',
    backgroundGradientAngle: 0,
    backgroundGradientColorStops: [
      { color: '', offset: 0 },
      { color: '', offset: 1 },
    ],
    backgroundGradientFrom: '',
    backgroundGradientStops: ['', ''],
    backgroundGradientTo: '',
    backgroundImageData: '',
    backgroundImageFit: 'contain',
    backgroundMode: 'image',
    browserMode: false,
    browserTitle: '',
    browserUrl: '',
    layoutMode: 'fit-image',
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    sourceImage: {
      ...DEFAULT_EDITOR_IMAGE_SETTINGS,
      opacity: 0.25,
      radius: 7,
      shadow: 20,
      strokeColor: '#123456',
      strokeOpacity: 0.4,
      strokeStyle: 'dot',
      strokeWidth: 3,
    },
  });
}

function createExplicitFalseyFrameInput(): Partial<EditorFrameSettings> {
  return {
    backgroundColor: '',
    backgroundGradientAngle: 0,
    backgroundGradientFrom: '',
    backgroundGradientTo: '',
    backgroundImageData: '',
    backgroundImageFit: 'contain',
    backgroundMode: 'image',
    browserMode: false,
    browserTitle: '',
    browserUrl: '',
    layoutMode: 'fit-image',
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    sourceImage: {
      ...DEFAULT_EDITOR_IMAGE_SETTINGS,
      opacity: 0.25,
      radius: 7,
      shadow: 20,
      strokeColor: '#123456',
      strokeOpacity: 0.4,
      strokeStyle: 'dot',
      strokeWidth: 3,
      borderPresetId: null,
    },
  };
}

describe('editor-document frame constants', () => {
  registerEditorFrameDefaultTests();
});

function registerEditorFrameDefaultTests() {
  it('keeps the canonical scene baseline in authoritative frame defaults', () => {
    expect(DEFAULT_EDITOR_FRAME_SETTINGS).toEqual(
      expect.objectContaining({
        backgroundGradientAngle: 145,
        backgroundMode: 'gradient',
        browserTitle: '',
        layoutMode: 'expand-canvas',
        paddingBottom: 128,
        paddingLeft: 128,
        paddingRight: 128,
        paddingTop: 128,
        sourceImage: DEFAULT_EDITOR_IMAGE_SETTINGS,
      })
    );
  });

  it(
    'falls back to canonical frame defaults for missing frame input',
    assertFrameDefaultsForMissingInput
  );

  it(
    'preserves explicit falsey frame values instead of replacing them',
    assertExplicitFalseyFrameValues
  );

  it('keeps browser-frame drafts header-only without variant/theme/window defaults', () => {
    expect(DEFAULT_BROWSER_FRAME_STATE).toEqual({
      title: '',
      url: '',
      faviconDataUrl: null,
      canvasMode: 'resize',
      contentMode: 'push-down',
    });
    const normalizedEnabled = normalizeBrowserFrameState({
      enabled: true,
    } as Partial<typeof DEFAULT_BROWSER_FRAME_STATE>);
    const normalizedMissing = normalizeBrowserFrameState(null);

    ['appearance', 'enabled'].forEach((property) => {
      expect(normalizedEnabled).not.toHaveProperty(property);
      expect(normalizedMissing).not.toHaveProperty(property);
    });
    ['variant', 'theme', 'mode'].forEach((property) => {
      expect(DEFAULT_BROWSER_FRAME_STATE).not.toHaveProperty(property);
    });
  });
}
