import { describe, expect, it } from 'vitest';
import {
  appendEditorEmbedMode,
  createScenarioEditorEmbedApplyMessage,
  createScenarioEditorEmbedCloseMessage,
  isEditorEmbedMessage,
  readEditorEmbedMode,
  readEditorEmbedSession,
  createScenarioEditorEmbedInitMessage,
  isEditorEmbedInitMessage,
} from './index';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../document/constants';

function createEditorDocument() {
  return {
    version: 2 as const,
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
        createScenarioEditorEmbedApplyMessage(
          'data:image/png;base64,abc',
          createEditorDocument(),
          'session-test'
        )
      )
    ).toBe(true);
    expect(isEditorEmbedMessage(createScenarioEditorEmbedCloseMessage('session-test'))).toBe(true);
    expect(isEditorEmbedMessage({ source: 'sniptale-editor-embed', type: 'scenario-apply' })).toBe(
      false
    );
    expect(
      isEditorEmbedMessage({
        ...createScenarioEditorEmbedApplyMessage(
          'https://example.com/image.png',
          createEditorDocument(),
          'session-test'
        ),
      })
    ).toBe(false);
    expect(isEditorEmbedMessage({ source: 'other', type: 'scenario-close' })).toBe(false);
  });
});

it('rejects missing, oversized, and malformed session identities and unsafe initialization', () => {
  expect(readEditorEmbedSession('?embedSession=valid_1-2')).toBe('valid_1-2');
  for (const sessionId of ['', 'x'.repeat(161), 'a b', '../foreign']) {
    expect(readEditorEmbedSession(`?embedSession=${encodeURIComponent(sessionId)}`)).toBeNull();
    expect(
      isEditorEmbedMessage({ source: 'sniptale-editor-embed', type: 'scenario-close', sessionId })
    ).toBe(false);
  }
  expect(
    isEditorEmbedInitMessage(
      createScenarioEditorEmbedInitMessage('session', {
        dataUrl: 'data:image/png;base64,abc',
        document: createEditorDocument(),
      })
    )
  ).toBe(true);
  expect(
    isEditorEmbedInitMessage(
      createScenarioEditorEmbedInitMessage('session', {
        dataUrl: 'https://remote.test/private.png',
      })
    )
  ).toBe(false);
  expect(
    isEditorEmbedMessage({
      source: 'sniptale-editor-embed',
      type: 'scenario-error',
      sessionId: 'session',
      code: 'raw exception',
    })
  ).toBe(false);
});
