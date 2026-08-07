// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('./surface', () => ({
  CalloutBody: (props: Record<string, any>) => (
    <div>
      <button
        data-action="left-pointer"
        onClick={() =>
          props['handleResizeLeftPointerDown']({
            button: 1,
            currentTarget: { setPointerCapture: vi.fn() },
            nativeEvent: { stopImmediatePropagation: vi.fn() },
            pointerId: 1,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
          })
        }
      />
      <button
        data-action="right-pointer"
        onClick={() =>
          props['handleResizeRightPointerDown']({
            button: 1,
            currentTarget: { setPointerCapture: vi.fn() },
            nativeEvent: { stopImmediatePropagation: vi.fn() },
            pointerId: 1,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
          })
        }
      />
      <button
        data-action="left-key"
        onClick={() =>
          props['handleResizeLeftKeyDown']({
            key: 'ArrowLeft',
            shiftKey: false,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
          })
        }
      />
      <button
        data-action="right-key"
        onClick={() =>
          props['handleResizeRightKeyDown']({
            key: 'ArrowRight',
            shiftKey: true,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
          })
        }
      />
    </div>
  ),
}));

import { createDefaultFrameCallout } from '../defaults';
import { FrameCalloutInteractiveSurface } from './interactive-surface';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('routes both pointer and keyboard resize handles through the shared interaction layout', () => {
  const onWidthChange = vi.fn();
  const noop = vi.fn();
  act(() =>
    root.render(
      <FrameCalloutInteractiveSurface
        editing={{
          events: {
            applyFormatting: noop,
            blur: noop,
            click: noop,
            input: noop,
            keyDown: noop,
            paste: noop,
          },
          layout: { dimensions: { width: 160, height: 60 }, floatingToolbarRect: null },
          refs: { container: createRef(), contentEditable: createRef() },
        }}
        frameBorderWidth={2}
        frameId="frame-1"
        frameRect={{ x: 100, y: 100, width: 200, height: 120 }}
        isEditing={false}
        isFrameEditing={false}
        isSettingsOpen={false}
        onCurveChange={noop}
        onPositionChange={noop}
        onSettingsClick={noop}
        onTailBaseRangeChange={noop}
        onTailFramePositionChange={noop}
        onTitleChange={noop}
        onWaypointChange={noop}
        onWidthChange={onWidthChange}
        portalTarget={document.body}
        portalTheme={null}
        settings={createDefaultFrameCallout()}
        settingsAnchorRef={createRef()}
        showSettingsHandle
        zIndex={2}
      />
    )
  );
  act(() => host.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click()));
  expect(host.querySelectorAll('button')).toHaveLength(4);
});
