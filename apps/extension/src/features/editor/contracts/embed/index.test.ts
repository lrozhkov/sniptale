import { describe, expect, it } from 'vitest';
import {
  appendEditorEmbedMode,
  createScenarioEditorEmbedApplyMessage,
  createScenarioEditorEmbedCloseMessage,
  isEditorEmbedMessage,
  readEditorEmbedMode,
} from './index';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../document/constants';

function createEditorDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,abc',
    sourceName: null,
    sourceWidth: 120,
    sourceHeight: 80,
    canvasWidth: 120,
    canvasHeight: 80,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 120,
    sourceDisplayHeight: 80,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"version":"7.2.0","objects":[]}',
  };
}

describe('editor embed contract', () => {
  it('reads the supported scenario embed mode from search params', () => {
    expect(readEditorEmbedMode('?embed=scenario')).toBe('scenario');
    expect(readEditorEmbedMode('?embed=other')).toBeNull();
    expect(readEditorEmbedMode('')).toBeNull();
  });

  it('appends scenario embed mode only when requested', () => {
    const url = appendEditorEmbedMode(new URL('https://example.com/editor'), 'scenario');
    const standaloneUrl = appendEditorEmbedMode(new URL('https://example.com/editor'), null);

    expect(url.searchParams.get('embed')).toBe('scenario');
    expect(standaloneUrl.searchParams.has('embed')).toBe(false);
  });

  it('builds and validates apply and close messages', () => {
    expect(
      isEditorEmbedMessage(
        createScenarioEditorEmbedApplyMessage('data:image/png;base64,abc', createEditorDocument())
      )
    ).toBe(true);
    expect(isEditorEmbedMessage(createScenarioEditorEmbedCloseMessage())).toBe(true);
    expect(isEditorEmbedMessage({ source: 'sniptale-editor-embed', type: 'scenario-apply' })).toBe(
      false
    );
    expect(
      isEditorEmbedMessage({
        ...createScenarioEditorEmbedApplyMessage(
          'https://example.com/image.png',
          createEditorDocument()
        ),
      })
    ).toBe(false);
    expect(isEditorEmbedMessage({ source: 'other', type: 'scenario-close' })).toBe(false);
  });
});
