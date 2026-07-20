import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../features/editor/document/constants';
import {
  parseScenarioStepEditorDocumentEntries,
  parseScenarioStepEditorDocumentEntry,
} from './index.guards.ts';

function createEditorDocument() {
  return {
    version: 1 as const,
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
    document: createEditorDocument(),
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
});
