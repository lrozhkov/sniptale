import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../features/editor/document/constants';
import {
  parseScenarioStepEditorDocumentEntries,
  parseScenarioStepEditorDocumentEntry,
} from './index.guards.ts';
import { createPersistedEditorDocumentFixture } from '../../document-assets/test-support';

function createEditorDocument() {
  return {
    version: 2 as const,
    sourceImageData: 'data:image/png;base64,doc',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"version":"7.2.0","objects":[]}',
  };
}

function createEntry() {
  return {
    createdAt: 100,
    document: createPersistedEditorDocumentFixture(createEditorDocument()),
    projectId: 'project-1',
    stepId: 'step-1',
    updatedAt: 200,
  };
}

describe('scenario step editor document guards', () => {
  it('accepts valid entries and rejects malformed payloads', () => {
    const entry = createEntry();

    expect(parseScenarioStepEditorDocumentEntry(entry)).toEqual(entry);
    expect(parseScenarioStepEditorDocumentEntry({ ...entry, updatedAt: '200' })).toBeNull();
  });

  it('filters invalid entries from stored lists and reports invalid roots', () => {
    expect(parseScenarioStepEditorDocumentEntries({ broken: true })).toEqual({
      entries: [],
      hasInvalidRoot: true,
      invalidEntryCount: 0,
    });

    expect(parseScenarioStepEditorDocumentEntries([createEntry(), { broken: true }])).toEqual({
      entries: [createEntry()],
      hasInvalidRoot: false,
      invalidEntryCount: 1,
    });
  });

  it('rejects entries with malformed document roots even when scalar fields look valid', () => {
    expect(
      parseScenarioStepEditorDocumentEntry({
        ...createEntry(),
        document: { version: 1 },
      })
    ).toBeNull();
  });

  it('returns the exact document projection instead of the hostile stored object', () => {
    const entry = createEntry();
    const parsed = parseScenarioStepEditorDocumentEntry({
      ...entry,
      ignoredEntryField: true,
      document: {
        ...entry.document,
        ignoredDocumentField: true,
        frame: { ...entry.document.frame, ignoredFrameField: true },
      },
    });

    expect(parsed).toEqual(entry);
    expect(parsed?.document).not.toHaveProperty('ignoredDocumentField');
    expect(parsed?.document.frame).not.toHaveProperty('ignoredFrameField');
    expect(parsed).not.toHaveProperty('ignoredEntryField');
  });
});
