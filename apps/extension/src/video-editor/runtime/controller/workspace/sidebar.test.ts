import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createWorkspaceSidebarController, createWorkspaceSidebarTrackActions } from './sidebar';

it('projects track metadata actions into the sidebar without adding another state owner', () => {
  const store = {
    renameTrack: vi.fn(),
    toggleTrackLock: vi.fn(),
    toggleTrackVisibility: vi.fn(),
    toggleUtilityLaneVisibility: vi.fn(),
    toggleUtilityLaneLock: vi.fn(),
    clearUtilityLane: vi.fn(),
  };

  const actions = createWorkspaceSidebarTrackActions(store);

  expect(actions.onToggleUtilityLaneVisibility).toBe(store.toggleUtilityLaneVisibility);
  expect(actions.onToggleUtilityLaneLock).toBe(store.toggleUtilityLaneLock);
  expect(actions.onClearUtilityLane).toBe(store.clearUtilityLane);
  expect(actions.onRenameTrack).toBe(store.renameTrack);
  expect(actions.onToggleTrackLock).toBe(store.toggleTrackLock);
  expect(actions.onToggleTrackVisibility).toBe(store.toggleTrackVisibility);
});

it('uses the track action projection in the complete sidebar controller', () => {
  const project = createEmptyVideoProject('Sidebar controller');
  const renameTrack = vi.fn();
  const toggleTrackLock = vi.fn();
  const toggleTrackVisibility = vi.fn();
  const fallback = vi.fn();
  const dependencyProxy = (overrides: Record<string, unknown> = {}) =>
    new Proxy(overrides, {
      get(target, property) {
        return Reflect.has(target, property) ? Reflect.get(target, property) : fallback;
      },
    });
  const store = dependencyProxy({
    diagnosticsOpen: false,
    placementMode: null,
    project,
    recordingId: null,
    renameTrack,
    toggleTrackLock,
    toggleTrackVisibility,
  });
  const workspace = dependencyProxy({
    grid: dependencyProxy(),
    inspector: dependencyProxy({ mode: 'selection' }),
    sceneBackgroundColors: dependencyProxy({ recentColors: [] }),
  });

  const controller = createWorkspaceSidebarController(
    {
      actions: dependencyProxy(),
      diagnosticsContent: null,
      libraries: dependencyProxy({ projects: [], recordings: [] }),
      selections: dependencyProxy({ selection: { kind: 'scene' } }),
      store,
      workspace,
    } as unknown as Parameters<typeof createWorkspaceSidebarController>[0],
    project,
    dependencyProxy() as Parameters<typeof createWorkspaceSidebarController>[2]
  );

  expect(controller.projectActions.onRenameTrack).toBe(renameTrack);
  expect(controller.projectActions.onToggleTrackLock).toBe(toggleTrackLock);
  expect(controller.projectActions.onToggleTrackVisibility).toBe(toggleTrackVisibility);

  const fallbackController = createWorkspaceSidebarController(
    {
      actions: dependencyProxy(),
      diagnosticsContent: null,
      libraries: dependencyProxy({ projects: [], recordings: [] }),
      selections: {
        selection: undefined,
        selectedActionEvent: null,
        selectedClip: null,
        selectedCursorSample: null,
        selectedMotionRegion: null,
        selectedObjectTrack: null,
        selectedTrack: null,
        selectedTransition: null,
      },
      store,
      workspace,
    } as unknown as Parameters<typeof createWorkspaceSidebarController>[0],
    project,
    dependencyProxy() as Parameters<typeof createWorkspaceSidebarController>[2]
  );
  expect(fallbackController.state.selection).toEqual({ kind: 'scene' });
});
