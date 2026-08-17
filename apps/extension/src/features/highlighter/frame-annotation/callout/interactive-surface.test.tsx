// @vitest-environment jsdom

import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fontMocks = vi.hoisted(() => ({
  install: vi.fn(async () => undefined),
  load: vi.fn(async () => true),
}));

vi.mock('./font-readiness', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./font-readiness')>()),
  getFrameCalloutFontProbeText: () => 'probe',
  loadFrameCalloutHandwrittenFont: fontMocks.load,
  requiresFrameCalloutHandwrittenFont: () => true,
}));

vi.mock('./font-installer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./font-installer')>()),
  installFrameCalloutHandwrittenFont: fontMocks.install,
}));

vi.mock('./surface', () => ({
  CalloutBody: (props: Record<string, any>) => (
    <div ref={props['wrapperRef']} data-drag-left={String(props['dragHandleStyle']?.left ?? '')}>
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
      <button
        data-action="drag"
        onClick={() =>
          props['handleDragPointerDown']({
            button: 0,
            clientX: 210,
            clientY: 210,
            ctrlKey: true,
            currentTarget: { setPointerCapture: vi.fn() },
            nativeEvent: { stopImmediatePropagation: vi.fn() },
            pointerId: 7,
            preventDefault: vi.fn(),
            shiftKey: false,
            stopPropagation: vi.fn(),
          })
        }
      />
      <button data-action="title" onClick={props['handleTitleToggleClick']} />
    </div>
  ),
}));

import { createDefaultFrameCallout } from '../defaults';
import { FrameCalloutInteractiveSurface } from './interactive-surface';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

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
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('routes both pointer and keyboard resize handles through the shared interaction layout', async () => {
  const onWidthChange = vi.fn();
  const onTitleEnabledChange = vi.fn();
  const noop = vi.fn();
  await act(async () =>
    root.render(
      <FrameCalloutInteractiveSurface
        chromeScale={0.5}
        editing={{
          events: {
            applyFormatting: noop,
            blur: noop,
            click: noop,
            finish: noop,
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
        onBadgeTextChange={noop}
        onPositionChange={noop}
        onSettingsClick={noop}
        onStartEditing={noop}
        onTailBaseRangeChange={noop}
        onTailFramePositionChange={noop}
        onTitleChange={noop}
        onTitleEnabledChange={onTitleEnabledChange}
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
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  act(() => host.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click()));
  act(() => {
    document.dispatchEvent(
      new TestPointerEvent('pointermove', {
        clientX: 260,
        clientY: 250,
        ctrlKey: true,
        pointerId: 7,
      })
    );
    document.dispatchEvent(
      new TestPointerEvent('pointerup', {
        clientX: 260,
        clientY: 250,
        ctrlKey: true,
        pointerId: 7,
      })
    );
  });
  expect(host.firstElementChild?.getAttribute('data-drag-left')).not.toBe('');
  expect(host.querySelectorAll('button')).toHaveLength(6);
  expect(onTitleEnabledChange).toHaveBeenCalledWith(true);
  expect(noop).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({ translateConnectorGeometry: true })
  );
  expect(fontMocks.install).toHaveBeenCalled();
  expect(fontMocks.load).toHaveBeenCalled();
});
