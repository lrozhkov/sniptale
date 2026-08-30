// @vitest-environment jsdom

import { act, createRef, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../callout-presets/catalog';
import { getDynamicTailState } from './dynamic-tail';
import { CalloutBody } from './surface';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('does not let a large title font impose the input default character width on the card', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const noop = vi.fn();
  const onBadgeTextChange = vi.fn();
  const props: ComponentProps<typeof CalloutBody> = {
    applyFormatting: noop,
    calloutDimensions: { height: 120, width: 240 },
    cloudStyle: {},
    containerRef: createRef<HTMLDivElement>(),
    contentEditableRef: createRef<HTMLDivElement>(),
    dragHandleStyle: {},
    dynamicTail: null,
    editableStyle: {},
    effectiveZIndex: 1,
    floatingToolbarRect: null,
    frameId: 'frame-1',
    handleBlur: noop,
    handleClick: noop,
    handleDragKeyDown: noop,
    handleDragPointerDown: noop,
    handleHandleBlur: noop,
    handleHandleFocus: noop,
    handleInput: noop,
    handleKeyDown: noop,
    handleMouseEnter: noop,
    handleMouseLeave: noop,
    handlePaste: noop,
    handleResizeLeftKeyDown: noop,
    handleResizeLeftPointerDown: noop,
    handleResizeRightKeyDown: noop,
    handleResizeRightPointerDown: noop,
    handleSettingsClick: noop,
    handleTitleToggleClick: noop,
    handleTailBaseEndKeyDown: noop,
    handleTailBaseEndPointerDown: noop,
    handleTailBaseRangeKeyDown: noop,
    handleTailBaseRangePointerDown: noop,
    handleTailFrameKeyDown: noop,
    handleTailFramePointerDown: noop,
    handleTailKeyDown: noop,
    handleTailPointerDown: noop,
    handleWaypointDoubleClick: noop,
    handleWaypointKeyDown: noop,
    handleWaypointPointerDown: noop,
    hasWaypoint: false,
    isDragging: false,
    isEditing: true,
    isGeometryHandleHidden: false,
    isHandleVisible: false,
    isResizingLeft: false,
    isResizingRight: false,
    isTailBaseEndDragging: false,
    isTailBaseRangeDragging: false,
    isTitleEnabled: true,
    isTailDragging: false,
    isTailFrameDragging: false,
    isWaypointDragging: false,
    isPolylineWaypoint: false,
    isWidthResizeHandleHidden: false,
    onTitleChange: noop,
    onBadgeEditingFinish: noop,
    onBadgeTextChange,
    portalTarget: document.body,
    portalTheme: null,
    resizeLeftHandleStyle: {},
    resizeRightHandleStyle: {},
    settings: {
      content: { bodyHtml: '', titleText: 'Wide heading' },
      enabled: true,
      placement: preset.placement,
      style: {
        ...preset.style,
        customCss: [
          '[card]',
          'filter: drop-shadow(0 2px 3px #000);',
          'box-shadow: inset 0 1px 0 #ffffff59;',
          '[title]',
          'text-transform: uppercase;',
          '[body]',
          'letter-spacing: 1px;',
        ].join('\n'),
        badge: {
          ...preset.style.badge,
          enabled: true,
          placement: 'title-start',
          text: 'MARK',
        },
        title: { ...preset.style.title, enabled: true, fontSize: 72 },
      },
    },
    settingsAnchorRef: createRef<HTMLButtonElement>(),
    settingsHandleStyle: {},
    showSettingsHandle: false,
    tailBaseEndHandleStyle: null,
    tailBaseRangeHandleStyle: null,
    tailFrameHandleStyle: null,
    tailHandleCursor: 'default',
    tailHandleStyle: null,
    waypointHandleStyle: null,
    waypointAngle: null,
    waypointAngleStyle: null,
    wrapperRef: createRef<HTMLDivElement>(),
    wrapperStyle: {},
  };

  act(() => root.render(<CalloutBody {...props} />));

  const title = document.querySelector<HTMLInputElement>('[data-sniptale-callout-title]');
  const titleShell = document.querySelector<HTMLElement>('[data-sniptale-callout-title-shell]');
  expect(title?.size).toBe(1);
  expect(title?.style.minWidth).toBe('0px');
  expect(titleShell?.style.fontSize).toBe('72px');
  expect(titleShell?.style.textTransform).toBe('uppercase');
  expect(props.containerRef.current?.style.filter).toBe('');
  expect(props.containerRef.current?.style.boxShadow).toBe('');
  expect(
    document.querySelector<HTMLElement>('[data-ui="content.callout.surface-effects"]')?.style.filter
  ).toBe('drop-shadow(0 2px 3px #000)');
  expect(props.contentEditableRef.current?.style.letterSpacing).toBe('1px');
  const titleMeasure = document.querySelector<HTMLElement>('[data-sniptale-callout-title-measure]');
  expect(titleMeasure?.textContent).toBe('MARKWide heading');
  expect(titleMeasure?.style.width).toBe('max-content');
  expect(titleMeasure?.style.height).toBe('0px');
  expect(titleMeasure?.style.display).toBe('flex');
  expect(
    titleMeasure?.querySelector('[data-sniptale-callout-badge-measure="true"]')?.textContent
  ).toBe('MARK');
  expect(document.querySelectorAll('[data-ui="content.callout.badge"]')).toHaveLength(1);
  const badgeInput = document.querySelector<HTMLInputElement>(
    'input[data-ui="content.callout.badge"]'
  )!;
  const badgeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    badgeSetter?.call(badgeInput, 'Edited tag');
    badgeInput.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(onBadgeTextChange).toHaveBeenCalledWith('Edited tag');
  act(() => {
    badgeInput.focus();
    badgeInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
  });
  for (const key of ['Escape', 'Enter']) {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });
    act(() => {
      badgeInput.focus();
      badgeInput.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(badgeInput);
  }

  const wedge = getDynamicTailState({
    bubbleRect: { x: 20, y: 20, width: 240, height: 120 },
    frameRect: { x: 100, y: 200, width: 120, height: 80 },
    tailSize: 8,
  });
  act(() =>
    root.render(
      <CalloutBody
        {...props}
        cloudStyle={{ background: '#ffffff80', boxShadow: '0 4px 12px #00000080' }}
        dynamicTail={wedge}
      />
    )
  );
  expect(props.containerRef.current?.style.backgroundColor).toBe('transparent');
  expect(props.containerRef.current?.style.backgroundImage).toBe('none');
  expect(props.containerRef.current?.style.backdropFilter).toBe('');
  expect(props.containerRef.current?.style.borderColor).toBe('transparent');
  expect(props.containerRef.current?.style.boxShadow).toBe('');
  expect(props.containerRef.current?.style.filter).toBe('');
  expect(props.wrapperRef.current?.style.filter).toBe('');
  expect(document.querySelector('[data-ui="content.callout.surface-compositor"]')).not.toBeNull();
  expect(document.querySelector('[data-ui="content.callout.surface-paint"]')).not.toBeNull();
  expect(document.querySelector('[data-ui="content.callout.surface-contour"]')).not.toBeNull();
  expect(document.querySelector('[data-ui="content.callout.unified-surface"]')).toBeNull();

  const bodyBeforeBadge = props.contentEditableRef.current;
  act(() =>
    root.render(
      <CalloutBody
        {...props}
        settings={{
          ...props.settings,
          style: {
            ...props.settings.style,
            badge: { ...props.settings.style.badge, placement: 'body-start' },
            title: { ...props.settings.style.title, enabled: false },
          },
        }}
      />
    )
  );
  expect(props.contentEditableRef.current).toBe(bodyBeforeBadge);
  expect(props.contentEditableRef.current?.parentElement?.style.minWidth).toBe('min-content');

  act(() =>
    root.render(
      <CalloutBody
        {...props}
        settings={{
          ...props.settings,
          style: {
            ...props.settings.style,
            badge: { ...props.settings.style.badge, placement: 'body-start' },
          },
        }}
      />
    )
  );

  const titleInput = document.querySelector<HTMLInputElement>('[data-sniptale-callout-title]')!;
  const titleSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    document
      .querySelector<HTMLElement>('.sniptale-callout')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    titleSetter?.call(titleInput, 'Changed title');
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    titleInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    titleInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    titleInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
  });
  expect(noop).toHaveBeenCalled();

  act(() =>
    root.render(
      <CalloutBody {...props} floatingToolbarRect={new DOMRect(20, 30, 80, 20)} isEditing />
    )
  );
  act(() =>
    document
      .querySelectorAll<HTMLButtonElement>('.sniptale-callout-format-toolbar button')
      .forEach((button) => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
  );
});

it('keeps body and title direction independent, including the auto bidi mode', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const noop = vi.fn();
  const props = {
    applyFormatting: noop,
    calloutDimensions: { height: 120, width: 240 },
    cloudStyle: {},
    containerRef: createRef<HTMLDivElement>(),
    contentEditableRef: createRef<HTMLDivElement>(),
    dragHandleStyle: {},
    dynamicTail: null,
    editableStyle: { unicodeBidi: 'plaintext' as const },
    effectiveZIndex: 1,
    floatingToolbarRect: null,
    frameId: 'frame-direction',
    handleBlur: noop,
    handleClick: noop,
    handleDragKeyDown: noop,
    handleDragPointerDown: noop,
    handleHandleBlur: noop,
    handleHandleFocus: noop,
    handleInput: noop,
    handleKeyDown: noop,
    handleMouseEnter: noop,
    handleMouseLeave: noop,
    handlePaste: noop,
    handleResizeLeftKeyDown: noop,
    handleResizeLeftPointerDown: noop,
    handleResizeRightKeyDown: noop,
    handleResizeRightPointerDown: noop,
    handleSettingsClick: noop,
    handleTitleToggleClick: noop,
    handleTailBaseEndKeyDown: noop,
    handleTailBaseEndPointerDown: noop,
    handleTailBaseRangeKeyDown: noop,
    handleTailBaseRangePointerDown: noop,
    handleTailFrameKeyDown: noop,
    handleTailFramePointerDown: noop,
    handleTailKeyDown: noop,
    handleTailPointerDown: noop,
    handleWaypointDoubleClick: noop,
    handleWaypointKeyDown: noop,
    handleWaypointPointerDown: noop,
    hasWaypoint: false,
    isDragging: false,
    isEditing: true,
    isGeometryHandleHidden: false,
    isHandleVisible: false,
    isPolylineWaypoint: false,
    isResizingLeft: false,
    isResizingRight: false,
    isTailBaseEndDragging: false,
    isTailBaseRangeDragging: false,
    isTitleEnabled: true,
    isTailDragging: false,
    isTailFrameDragging: false,
    isWaypointDragging: false,
    isWidthResizeHandleHidden: false,
    onTitleChange: noop,
    onBadgeEditingFinish: noop,
    onBadgeTextChange: noop,
    portalTarget: document.body,
    portalTheme: null,
    resizeLeftHandleStyle: {},
    resizeRightHandleStyle: {},
    settings: {
      content: { bodyHtml: '<p>مرحبا 123</p>', titleText: 'Title' },
      enabled: true,
      placement: preset.placement,
      style: {
        ...preset.style,
        title: { ...preset.style.title, direction: 'auto' as const, enabled: true },
        typography: { ...preset.style.typography, direction: 'rtl' as const },
      },
    },
    settingsAnchorRef: createRef<HTMLButtonElement>(),
    settingsHandleStyle: {},
    showSettingsHandle: false,
    tailBaseEndHandleStyle: null,
    tailBaseRangeHandleStyle: null,
    tailFrameHandleStyle: null,
    tailHandleCursor: 'default',
    tailHandleStyle: null,
    waypointAngle: null,
    waypointAngleStyle: null,
    waypointHandleStyle: null,
    wrapperRef: createRef<HTMLDivElement>(),
    wrapperStyle: {},
  } satisfies ComponentProps<typeof CalloutBody>;

  act(() => root.render(<CalloutBody {...props} />));

  expect(props.contentEditableRef.current?.getAttribute('dir')).toBe('rtl');
  expect(props.contentEditableRef.current?.style.unicodeBidi).toBe('plaintext');
  expect(document.querySelector('[data-sniptale-callout-title-shell]')?.getAttribute('dir')).toBe(
    'auto'
  );
  expect(document.querySelector('[data-sniptale-callout-title]')?.getAttribute('dir')).toBe('auto');
});
