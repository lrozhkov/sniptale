// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buildScenarioEditorUrlMock = vi.hoisted(() =>
  vi.fn(() => '/scenario-editor?project=1&step=2')
);

vi.mock('../../../platform/navigation/extension-pages/scenario-editor', () => ({
  buildScenarioEditorUrl: buildScenarioEditorUrlMock,
}));

vi.mock('@sniptale/runtime-contracts/scenario-editor/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/runtime-contracts/scenario-editor/session')>()),
  readScenarioEditorPresentationSessionId: vi.fn((search: string) =>
    new URLSearchParams(search).get('presentationSessionId')
  ),
  readScenarioEditorPresentationView: vi.fn((search: string) => {
    const value = new URLSearchParams(search).get('presentationView');
    return value === 'audience' ? value : null;
  }),
}));

import { downloadScenarioEditorBlob, replaceScenarioEditorSelectionInUrl } from '.';

describe('scenario editor browser driver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  registerDownloadTests();
  registerSelectionUrlTests();
});

function registerDownloadTests() {
  it('downloads blobs through the explicit DOM-driver seam', () => {
    const link = document.createElement('a');
    const click = vi.spyOn(link, 'click').mockImplementation(() => {});
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(link);
    const revokeObjectURL = vi.fn();

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:scenario-export'),
      revokeObjectURL,
    });
    vi.useFakeTimers();

    downloadScenarioEditorBlob(new Blob(['data']), 'demo.txt');
    vi.runAllTimers();

    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(link.download).toBe('demo.txt');
    expect(link.href).toBe('blob:scenario-export');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:scenario-export');
  });
}

function registerSelectionUrlTests() {
  it('replaces editor selection in browser history through the explicit owner seam', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});

    replaceScenarioEditorSelectionInUrl({
      projectId: 'project-1',
      stepId: 'step-2',
    });

    expect(buildScenarioEditorUrlMock).toHaveBeenCalledWith({
      presentationSessionId: null,
      presentationView: null,
      projectId: 'project-1',
      stepId: 'step-2',
    });
    expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/scenario-editor?project=1&step=2');
  });

  it('omits the step id when replacing a project-only selection in browser history', () => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});

    replaceScenarioEditorSelectionInUrl({
      projectId: 'project-1',
    });

    expect(buildScenarioEditorUrlMock).toHaveBeenLastCalledWith({
      presentationSessionId: null,
      presentationView: null,
      projectId: 'project-1',
    });
  });
  registerPresentationSelectionUrlTests();
}

function registerPresentationSelectionUrlTests() {
  it('preserves audience presentation query fields while replacing project selection', () => {
    window.history.pushState(
      {},
      '',
      '/scenario-editor?presentationView=audience&presentationSessionId=session-1'
    );
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});

    replaceScenarioEditorSelectionInUrl({
      projectId: 'project-1',
    });

    expect(buildScenarioEditorUrlMock).toHaveBeenLastCalledWith({
      presentationSessionId: 'session-1',
      presentationView: 'audience',
      projectId: 'project-1',
    });
  });
}
