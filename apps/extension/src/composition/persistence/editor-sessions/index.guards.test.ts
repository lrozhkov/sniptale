import { describe, expect, it } from 'vitest';
import { type EditorDocument } from '../../../features/editor/document/types';
import type { EditorSessionEntry } from './contracts';
import { parseEditorSessionEntry } from './index.guards.ts';

const TEST_IMAGE_DATA_URL =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';

function createEditorDocumentFixture(): EditorDocument {
  return {
    version: 1,
    sourceImageData: TEST_IMAGE_DATA_URL,
    sourceName: 'capture.png',
    sourceWidth: 1280,
    sourceHeight: 720,
    canvasWidth: 1280,
    canvasHeight: 720,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 1280,
    sourceDisplayHeight: 720,
    frame: {
      browserMode: false,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color',
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#000000',
      backgroundGradientAngle: 90,
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      layoutMode: 'fit-image',
      browserTitle: '',
      browserUrl: '',
    },
    browserFrame: {
      enabled: true,
      appearance: 'window',
      title: 'Example',
      url: 'https://example.com',
      canvasMode: 'resize',
      contentMode: 'fit-content',
    },
    canvasJson: '{}',
  };
}

function createEditorSessionEntryFixture(
  overrides: Partial<EditorSessionEntry> = {}
): EditorSessionEntry {
  return {
    sessionId: 'session-1',
    document: createEditorDocumentFixture(),
    assetId: null,
    sourceUrl: null,
    sourceTitle: null,
    createdAt: 1000,
    updatedAt: 2000,
    dirty: true,
    ...overrides,
  };
}

describe('editor session entry guards valid payloads', () => {
  it('accepts entries with nullable metadata fields', () => {
    const entry = createEditorSessionEntryFixture();

    expect(parseEditorSessionEntry(entry)).toEqual(entry);
    expect(
      parseEditorSessionEntry({
        ...entry,
        sourceTitle: null,
      })
    ).toEqual({
      ...entry,
      sourceTitle: null,
    });
  });

  it('accepts entries with string metadata fields', () => {
    const entry = createEditorSessionEntryFixture({
      assetId: 'asset-1',
      sourceUrl: 'https://example.com',
      sourceTitle: 'Example',
    });

    expect(parseEditorSessionEntry(entry)).toEqual(entry);
  });

  it('accepts entries with empty nullable metadata strings', () => {
    const entry = createEditorSessionEntryFixture({
      assetId: '',
      sourceUrl: '',
      sourceTitle: '',
    });

    expect(parseEditorSessionEntry(entry)).toEqual(entry);
  });
});

describe('editor session entry guards invalid payloads', () => {
  it('rejects non-record payloads', () => {
    expect(parseEditorSessionEntry(undefined)).toBeNull();
    expect(parseEditorSessionEntry('session-1')).toBeNull();
  });

  it('rejects malformed scalar fields', () => {
    expect(
      parseEditorSessionEntry({ ...createEditorSessionEntryFixture(), sessionId: 7 })
    ).toBeNull();
    expect(
      parseEditorSessionEntry({ ...createEditorSessionEntryFixture(), updatedAt: Number.NaN })
    ).toBeNull();
    expect(
      parseEditorSessionEntry({ ...createEditorSessionEntryFixture(), dirty: 'yes' })
    ).toBeNull();
  });

  it('rejects malformed document and nullable string fields', () => {
    expect(
      parseEditorSessionEntry({ ...createEditorSessionEntryFixture(), document: {} })
    ).toBeNull();
    expect(
      parseEditorSessionEntry({ ...createEditorSessionEntryFixture(), assetId: 42 })
    ).toBeNull();
    expect(
      parseEditorSessionEntry({ ...createEditorSessionEntryFixture(), sourceUrl: 9 })
    ).toBeNull();
    expect(
      parseEditorSessionEntry({ ...createEditorSessionEntryFixture(), sourceTitle: false })
    ).toBeNull();
  });
});
