// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../../features/video/project/motion';
import { InspectMotionLanePanel } from './motion-lane';

it('edits lane visibility/lock and keeps creation in the toolbar and gates clear using current lane state', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const project = createEmptyVideoProject('Zoom');
  project.motionRegions = [createVideoProjectMotionRegion(project, 0)];
  const visibility = vi.fn(),
    lock = vi.fn(),
    clear = vi.fn(),
    add = vi.fn();
  const render = () =>
    act(() =>
      root.render(
        <InspectMotionLanePanel
          project={project}
          onToggleUtilityLaneVisibility={visibility}
          onToggleUtilityLaneLock={lock}
          onClearUtilityLane={clear}
          onAddMotionRegion={add}
        />
      )
    );
  try {
    render();
    const toggles = host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
    expect(toggles).toHaveLength(2);
    act(() => toggles[0]!.click());
    expect(visibility).toHaveBeenCalledWith('camera');
    act(() => toggles[1]!.click());
    expect(lock).toHaveBeenCalledWith('camera');
    const actions = () =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('button')).filter(
        (b) => !b.hasAttribute('aria-pressed')
      );
    act(() => actions()[0]!.click());
    expect(add).not.toHaveBeenCalled();
    expect(actions()).toHaveLength(1);
    expect(clear).toHaveBeenCalledWith('camera');
    project.utilityLanes = {
      actions: { visible: true, locked: false },
      camera: { visible: true, locked: true },
    };
    render();
    expect(actions().every((b) => b.disabled)).toBe(true);
    project.utilityLanes.camera = { visible: false, locked: false };
    render();
    expect(actions()[0]!.disabled).toBe(false);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
