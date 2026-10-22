// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, CameraOff } from 'lucide-react';
import { expect, it, vi } from 'vitest';
import { useToolbarMenuState } from '../state/menu';
import { RecordingMediaSplitControl } from './media-menu';
import { RecordingSpotlightMenu } from './spotlight-menu';
import { RecordingDrawingControls } from './drawing-controls';
import { createRecordingDrawingOwner } from './drawing-session';

it.each([false, true])(
  'keeps the camera placement choice authoritative with recording locked=%s',
  async (locked) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const onChange = vi.fn(async () => {
      throw new Error('storage failed');
    });
    const onToggle = vi.fn();
    const onLoadDevices = vi.fn(async () => []);
    try {
      await act(async () =>
        root.render(
          <RecordingMediaSplitControl
            active={false}
            activeIcon={Camera}
            inactiveIcon={CameraOff}
            disabled={false}
            kind="videoinput"
            dataUi="test.camera"
            displayMode="horizontal"
            label="Camera"
            selectedDeviceId={null}
            onToggle={onToggle}
            onLoadDevices={onLoadDevices}
            cameraPlacement={{ mode: 'embedded', locked, onChange }}
          />
        )
      );
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[data-ui="test.camera.menu"]')!.click()
      );
      const placement = host.querySelector(
        '[data-ui="content.toolbar.video-recording.camera.placement"]'
      )!;
      const buttons = placement.querySelectorAll('button');
      expect(buttons).toHaveLength(2);
      expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
      expect(buttons[1]!.disabled).toBe(locked);
      await act(async () => buttons[1]!.click());
      expect(onToggle).not.toHaveBeenCalled();
      expect(onLoadDevices).toHaveBeenCalledTimes(1);
      expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
      expect(
        host.querySelector('[data-ui="test.camera.menu"]')!.getAttribute('aria-expanded')
      ).toBe('true');
      if (locked) expect(onChange).not.toHaveBeenCalled();
      else {
        expect(onChange).toHaveBeenCalledWith('separate-track');
        expect(host.querySelector('[role="alert"]')).not.toBeNull();
        expect(buttons[1]!.disabled).toBe(false);
      }
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);

it.each(['camera', 'microphone', 'spotlight', 'auto-hide'] as const)(
  '%s Escape restoration survives the real dismissal callback',
  async (control) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const owner = createRecordingDrawingOwner();
    function Harness() {
      const toolbarMenuState = useToolbarMenuState();
      return (
        <div className="sniptale-toolbar-root">
          {control === 'camera' || control === 'microphone' ? (
            <RecordingMediaSplitControl
              active={false}
              activeIcon={Camera}
              inactiveIcon={CameraOff}
              disabled={false}
              kind={control === 'camera' ? 'videoinput' : 'audioinput'}
              dataUi={`test.${control}`}
              displayMode="horizontal"
              label={control}
              selectedDeviceId={null}
              menuType={control === 'camera' ? 'recording-camera' : 'recording-microphone'}
              toolbarMenuState={toolbarMenuState}
              onToggle={() => {}}
            />
          ) : control === 'spotlight' ? (
            <RecordingSpotlightMenu
              compact={false}
              disabled={false}
              displayMode="horizontal"
              settings={{
                cursorHaloEnabled: false,
                cursorDimmingEnabled: false,
                clickAnimationEnabled: false,
              }}
              toolbarMenuState={toolbarMenuState}
              onChange={() => {}}
            />
          ) : (
            <RecordingDrawingControls
              compactMenus={false}
              displayMode="horizontal"
              interactionMode="navigation"
              owner={owner}
              toolbarMenuState={toolbarMenuState}
              onInteractionModeChange={() => {}}
            />
          )}
        </div>
      );
    }
    try {
      act(() => root.render(<Harness />));
      const dataUi =
        control === 'camera' || control === 'microphone'
          ? `test.${control}.menu`
          : `content.toolbar.video-recording.${control}`;
      const trigger = host.querySelector<HTMLButtonElement>(`[data-ui="${dataUi}"]`);
      if (!trigger) throw new Error(`Missing actual ${control} trigger`);
      for (const keyboard of [false, true]) {
        act(() => {
          trigger.dispatchEvent(
            keyboard
              ? new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
              : new MouseEvent('mousedown', { bubbles: true })
          );
          trigger.click();
        });
        await act(async () => {
          await Promise.resolve();
        });
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        act(() => {
          trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        await act(async () => {
          await Promise.resolve();
        });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);
        expect(trigger.getAttribute('data-focus-restoration')).toBe(keyboard ? null : 'pointer');
      }
    } finally {
      act(() => root.unmount());
      owner.dispose();
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);
