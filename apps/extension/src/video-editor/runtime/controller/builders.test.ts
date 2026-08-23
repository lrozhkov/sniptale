import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoEditorShellController } from './shell';
import { createWorkspaceDiagnosticsController } from './workspace';

it('builds shell and diagnostics leaves from their exact projections', () => {
  const project = createEmptyVideoProject('Capability shell');
  expect(createVideoEditorShellController({ error: null, isReady: true, project })).toEqual({
    error: null,
    isReady: true,
    project,
  });

  const setDiagnosticsOpen = vi.fn();
  const diagnostics = createWorkspaceDiagnosticsController({
    diagnosticsOpen: true,
    recordingId: 'recording-1',
    setDiagnosticsOpen,
  });
  diagnostics.onClose();

  expect(diagnostics.isOpen).toBe(true);
  expect(diagnostics.recordingId).toBe('recording-1');
  expect(setDiagnosticsOpen).toHaveBeenCalledWith(false);
});
