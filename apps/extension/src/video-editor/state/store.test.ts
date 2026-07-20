import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';

import { useVideoEditorStore } from './store';

afterEach(() => {
  useVideoEditorStore.setState(useVideoEditorStore.getInitialState(), true);
});

describe('video-editor/state/store', () => {
  it('composes timeline, project, and export actions into the store state', () => {
    const state = useVideoEditorStore.getState();

    expect(state.project).toBeNull();
    expect(typeof state.setProject).toBe('function');
    expect(typeof state.renameProject).toBe('function');
    expect(typeof state.openExportDialog).toBe('function');
  });

  it('opens export settings through the canonical export-state owner after project load', () => {
    useVideoEditorStore.getState().setProject(createEmptyVideoProject('Demo', 1280, 720), 'rec-1');
    useVideoEditorStore.getState().openExportDialog();

    expect(useVideoEditorStore.getState().exportState).toMatchObject({
      dialogOpen: true,
      settings: expect.objectContaining({
        height: 720,
        width: 1280,
      }),
    });
  });
});
