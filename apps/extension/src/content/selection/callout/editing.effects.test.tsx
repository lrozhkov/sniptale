// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dispatchCalloutBlurRequest } from '../../platform/page-context/frame-events';
import {
  useCalloutBlurRequestEffect,
  useCalloutEditingFocusEffect,
  useCalloutEscapeCaptureEffect,
} from './editing.effects';

function FocusEffectHarness(props: {
  htmlContent: string;
  isEditing: boolean;
  rerenderToken: number;
}) {
  const contentEditableRef = React.useRef<HTMLDivElement | null>(null);

  useCalloutEditingFocusEffect({
    contentEditableRef,
    htmlContent: props.htmlContent,
    isEditing: props.isEditing,
  });

  return (
    <div
      ref={contentEditableRef}
      contentEditable={props.isEditing}
      data-token={props.rerenderToken}
      suppressContentEditableWarning
    />
  );
}

function BlurRequestHarness(props: {
  finishEditing: (editableElement?: HTMLDivElement | null) => void;
  frameId: string;
}) {
  const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
  useCalloutBlurRequestEffect({
    contentEditableRef,
    finishEditing: props.finishEditing,
    frameId: props.frameId,
  });

  return <div ref={contentEditableRef} contentEditable suppressContentEditableWarning />;
}

function EscapeCaptureHarness(props: {
  finishEditing: (editableElement?: HTMLDivElement | null) => void;
}) {
  const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
  useCalloutEscapeCaptureEffect({
    contentEditableRef,
    finishEditing: props.finishEditing,
    isEditing: true,
  });

  return (
    <div
      ref={contentEditableRef}
      className="sniptale-callout-editable"
      contentEditable
      suppressContentEditableWarning
    />
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  // React 19 act() environment flag for jsdom unit tests.
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

function renderHarness(props: { htmlContent: string; isEditing: boolean; rerenderToken: number }) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<FocusEffectHarness {...props} />);
  });
}

function renderBlurRequestHarness(finishEditing = vi.fn()) {
  renderHarness({
    htmlContent: 'hello world',
    isEditing: true,
    rerenderToken: 0,
  });

  act(() => {
    root?.render(<BlurRequestHarness finishEditing={finishEditing} frameId="frame-1" />);
  });

  const editable = container?.querySelector<HTMLDivElement>('[contenteditable="true"]');
  expect(editable).toBeInstanceOf(HTMLDivElement);

  return { editable, finishEditing };
}

function renderEscapeCaptureHarness(finishEditing = vi.fn()) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<EscapeCaptureHarness finishEditing={finishEditing} />);
  });

  const editable = container?.querySelector<HTMLDivElement>('.sniptale-callout-editable');
  expect(editable).toBeInstanceOf(HTMLDivElement);

  return { editable, finishEditing };
}

describe('useCalloutEditingFocusEffect', () => {
  it('does not reset an active selection during rerenders while editing stays enabled', () => {
    renderHarness({
      htmlContent: 'hello world',
      isEditing: true,
      rerenderToken: 0,
    });

    const editable = container?.querySelector<HTMLDivElement>('[contenteditable="true"]');
    expect(editable).toBeInstanceOf(HTMLDivElement);

    const textNode = editable?.firstChild;
    expect(textNode).toBeInstanceOf(Text);

    const selection = window.getSelection();
    expect(selection).not.toBeNull();

    const range = document.createRange();
    range.setStart(textNode as Text, 0);
    range.setEnd(textNode as Text, 5);
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(selection?.isCollapsed).toBe(false);
    expect(selection?.toString()).toBe('hello');

    renderHarness({
      htmlContent: 'hello world',
      isEditing: true,
      rerenderToken: 1,
    });

    expect(selection?.isCollapsed).toBe(false);
    expect(selection?.toString()).toBe('hello');
  });
});

describe('useCalloutEscapeCaptureEffect', () => {
  it('finishes editing when Escape comes from the editable path behind a shadow host', () => {
    const finishEditing = vi.fn();
    const { editable } = renderEscapeCaptureHarness(finishEditing);
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      value: document.body,
    });

    act(() => {
      editable?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(finishEditing).toHaveBeenCalledWith(editable);
  });
});

describe('useCalloutBlurRequestEffect', () => {
  it('blurs only the matching callout editor for shared blur-request events', () => {
    const { editable } = renderBlurRequestHarness();
    const blurSpy = editable ? vi.spyOn(editable, 'blur') : null;

    act(() => {
      dispatchCalloutBlurRequest({ frameId: 'other-frame' });
      dispatchCalloutBlurRequest({ frameId: 'frame-1' });
    });

    expect(blurSpy).toHaveBeenCalledTimes(1);
  });

  it('finishes editing directly before blurring the matching callout editor', () => {
    const finishEditing = vi.fn();
    const { editable } = renderBlurRequestHarness(finishEditing);
    const blurSpy = editable
      ? vi.spyOn(editable, 'blur').mockImplementation(() => undefined)
      : null;

    act(() => {
      dispatchCalloutBlurRequest({ frameId: 'frame-1' });
    });

    expect(finishEditing).toHaveBeenCalledWith(editable);
    expect(blurSpy).toHaveBeenCalledTimes(1);
  });
});
