// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createApplyLoadedProject } from './effects';

vi.mock('../browser-driver', () => ({
  replaceVideoEditorUrl: vi.fn(),
}));

it('applies a loaded project and updates browser history through the explicit driver seam', async () => {
  const { replaceVideoEditorUrl } = await import('../browser-driver');
  const setProject = vi.fn();
  const setError = vi.fn();
  const project = createEmptyVideoProject('Loaded');

  createApplyLoadedProject(setProject, setError)(project, 'recording-1');

  expect(setProject).toHaveBeenCalledWith(project, 'recording-1', undefined);
  expect(setError).toHaveBeenCalledWith(null);
  expect(replaceVideoEditorUrl).toHaveBeenCalledWith(project.id, 'recording-1');
});

it('forwards the observed native opening snapshot to the session owner', () => {
  const project = createEmptyVideoProject('Native');
  const workspace = {
    status: 'ready' as const,
    project,
    workspaceRevision: 9,
    history: { status: 'absent' as const },
  };
  const setProject = vi.fn();
  createApplyLoadedProject(setProject, vi.fn())(project, null, workspace);
  expect(setProject).toHaveBeenCalledWith(project, null, workspace);
});
