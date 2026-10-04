import { beforeEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({
  enabled: vi.fn(),
  surface: vi.fn(),
  sidebar: vi.fn(),
  open: vi.fn(),
}));
vi.mock('../runtime/transport/session', () => ({
  setScenarioEnabled: transport.enabled,
  updateScenarioSurfaceState: transport.surface,
  setScenarioSidebarVisible: transport.sidebar,
}));
vi.mock('../runtime/transport/projects', () => ({ openScenarioEditor: transport.open }));
import { finishScenarioRecording } from './finish';

function createArgs() {
  return {
    applyScenarioResponse: vi.fn(),
    refreshSession: vi.fn(async () => undefined),
    currentSurface: {
      captureAction: 'scenario' as const,
      screenshotMode: true,
      toolbarVisible: false,
    },
    currentSession: {
      enabled: true,
      captureMode: 'manual' as const,
      projectId: 'last-project',
      projectName: 'Project',
      pendingProjectSelection: false,
      rememberProjectSelection: true,
      sidebarVisible: true,
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  transport.enabled.mockResolvedValue({ success: true });
  transport.surface.mockResolvedValue({ success: true });
  transport.sidebar.mockResolvedValue({ success: true });
  transport.open.mockResolvedValue(undefined);
});
describe('finish recording transaction', () => {
  it('stops recording before opening the current project and only then applies the closed surface', async () => {
    const args = createArgs();
    transport.open.mockImplementation(async () => {
      expect(transport.enabled).toHaveBeenCalledWith(false);
      expect(transport.sidebar).toHaveBeenCalledWith(false);
      expect(args.applyScenarioResponse).not.toHaveBeenCalled();
    });
    await finishScenarioRecording(args);
    expect(transport.open).toHaveBeenCalledExactlyOnceWith({ projectId: 'last-project' });
    expect(args.applyScenarioResponse).toHaveBeenCalledTimes(2);
    expect(args.refreshSession).not.toHaveBeenCalled();
  });
  it('does not open the editor or hide UI when stopping is rejected', async () => {
    const args = createArgs();
    transport.enabled.mockResolvedValueOnce({ success: false });
    await expect(finishScenarioRecording(args)).rejects.toThrow();
    expect(transport.open).not.toHaveBeenCalled();
    expect(transport.surface).not.toHaveBeenCalled();
    expect(args.applyScenarioResponse).not.toHaveBeenCalled();
  });
  it.each(['surface', 'sidebar', 'open'] as const)(
    'restores recording after %s fails without losing project or steps',
    async (stage) => {
      const args = createArgs();
      if (stage === 'open') transport.open.mockRejectedValueOnce(new Error('Open failed'));
      else transport[stage].mockResolvedValueOnce({ success: false });
      await expect(finishScenarioRecording(args)).rejects.toThrow();
      expect(transport.surface).toHaveBeenLastCalledWith(args.currentSurface);
      expect(transport.sidebar).toHaveBeenLastCalledWith(true);
      expect(transport.enabled.mock.calls).toEqual([[false], [true]]);
      expect(args.applyScenarioResponse).not.toHaveBeenCalled();
      expect(args.refreshSession).toHaveBeenCalledOnce();
      if (stage !== 'open') expect(transport.open).not.toHaveBeenCalled();
    }
  );
  it('refreshes authoritative state and leaves recording stopped if compensation fails', async () => {
    const args = createArgs();
    transport.open.mockRejectedValueOnce(new Error('Open failed'));
    transport.surface
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });
    await expect(finishScenarioRecording(args)).rejects.toThrow();
    expect(transport.enabled).toHaveBeenCalledExactlyOnceWith(false);
    expect(args.refreshSession).toHaveBeenCalledOnce();
  });
});
