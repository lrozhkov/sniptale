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
  const setDiagnosticsOpen = vi.fn();
  const project = createEmptyVideoProject('Loaded');

  createApplyLoadedProject(setProject, setError, setDiagnosticsOpen)(project, 'recording-1');

  expect(setProject).toHaveBeenCalledWith(project, 'recording-1');
  expect(setError).toHaveBeenCalledWith(null);
  expect(setDiagnosticsOpen).toHaveBeenCalledWith(false);
  expect(replaceVideoEditorUrl).toHaveBeenCalledWith(project.id, 'recording-1');
});
