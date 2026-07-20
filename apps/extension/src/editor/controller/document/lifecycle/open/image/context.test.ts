import { afterEach, expect, it } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../../../features/editor/document/constants';
import { useEditorStore } from '../../../../../state/useEditorStore';
import { resolveEditorOpenImageContext } from './context';

function resetOpenImageContextStore() {
  useEditorStore.setState({
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
  });
}

function createStoredFrame() {
  return {
    ...DEFAULT_EDITOR_FRAME_SETTINGS,
    backgroundColor: '#123456',
    backgroundGradientAngle: 12,
    backgroundGradientFrom: '#abcdef',
    backgroundGradientTo: '#fedcba',
    backgroundImageData: 'data:image/png;base64,background',
    backgroundImageFit: 'tile' as const,
    backgroundMode: 'image' as const,
    browserMode: true,
    layoutMode: 'expand-canvas' as const,
    paddingTop: 24,
    paddingRight: 16,
    paddingBottom: 12,
    paddingLeft: 8,
  };
}

afterEach(() => {
  resetOpenImageContextStore();
});

it('opens a fresh image with a clean scene frame and keeps browser metadata overrides', async () => {
  useEditorStore.setState({
    browserFrame: {
      ...DEFAULT_BROWSER_FRAME_STATE,
      url: 'https://stored.example',
    },
    frame: createStoredFrame(),
  });

  const context = await resolveEditorOpenImageContext({
    browserFrameUrl: 'https://override.example',
    pageTitle: 'Opened page',
    sourceFaviconUrl: 'https://override.example/favicon.ico',
  });

  expect(context.browserFrameUrl).toBe('https://override.example');
  expect(context.pageTitle).toBe('Opened page');
  expect(context.sourceFaviconUrl).toBe('https://override.example/favicon.ico');
  expect(context.frame).toEqual({
    ...createStoredFrame(),
    backgroundColor: 'transparent',
    backgroundGradientAngle: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientAngle,
    backgroundGradientFrom: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientFrom,
    backgroundGradientTo: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundGradientTo,
    backgroundImageData: null,
    backgroundImageFit: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageFit,
    backgroundMode: 'color',
    layoutMode: 'fit-image',
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  });
});

it('keeps stored browser-frame url when open options omit overrides', async () => {
  useEditorStore.setState({
    browserFrame: {
      ...DEFAULT_BROWSER_FRAME_STATE,
      url: 'https://stored.example',
    },
    frame: createStoredFrame(),
  });

  const context = await resolveEditorOpenImageContext({});

  expect(context.browserFrameUrl).toBe('https://stored.example');
  expect(context.pageTitle).toBe('');
  expect(context.sourceFaviconUrl).toBeNull();
  expect(context.frame.paddingTop).toBe(0);
  expect(context.frame.layoutMode).toBe('fit-image');
  expect(context.frame.backgroundMode).toBe('color');
  expect(context.frame.backgroundImageData).toBeNull();
});
