// @vitest-environment jsdom

import { act, createRef, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { CalloutBody } from './body';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../interactive-frame/layout/portal', async (importOriginal) => ({
  ...(await importOriginal()),
  resolveContentPortalTarget: () => document.body,
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
    handleTailBaseEndKeyDown: noop,
    handleTailBaseEndPointerDown: noop,
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
    isTailDragging: false,
    isTailFrameDragging: false,
    isWaypointDragging: false,
    isPolylineWaypoint: false,
    isWidthResizeHandleHidden: false,
    onTitleChange: noop,
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
    tailFrameHandleStyle: null,
    tailHandleCursor: 'default',
    tailHandleStyle: null,
    voice: {
      actions: { start: noop, stop: noop },
      state: { active: false, audioLevel: 0, errorCode: null, phase: 'idle' },
    },
    voiceButtonLeftOffset: 0,
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
  expect(title?.style.minWidth).toBe('0');
  expect(titleShell?.style.fontSize).toBe('72px');
  expect(titleShell?.style.textTransform).toBe('uppercase');
  expect(props.containerRef.current?.style.filter).toBe('drop-shadow(0 2px 3px #000)');
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
    handleTailBaseEndKeyDown: noop,
    handleTailBaseEndPointerDown: noop,
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
    isTailDragging: false,
    isTailFrameDragging: false,
    isWaypointDragging: false,
    isWidthResizeHandleHidden: false,
    onTitleChange: noop,
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
    tailFrameHandleStyle: null,
    tailHandleCursor: 'default',
    tailHandleStyle: null,
    voice: {
      actions: { start: noop, stop: noop },
      state: { active: false, audioLevel: 0, errorCode: null, phase: 'idle' as const },
    },
    voiceButtonLeftOffset: 0,
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
