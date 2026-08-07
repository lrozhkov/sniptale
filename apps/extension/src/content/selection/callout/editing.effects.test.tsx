// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { dispatchCalloutBlurRequest } from '../../platform/page-context/frame-events';
import {
  useCalloutEditingFocusEffect,
  useCalloutEscapeCaptureEffect,
} from '../../../features/highlighter/frame-annotation/callout/editing-effects';
import { useCalloutBlurRequestEffect } from './editing-blur-request-effect';
import { useCalloutEditing } from './editing';
import { useCalloutEditingHandlers } from '../../../features/highlighter/frame-annotation/callout/editing-handlers';

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
  stopVoiceInput?: () => void;
  voiceActive?: boolean;
}) {
  const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
  useCalloutEscapeCaptureEffect({
    contentEditableRef,
    finishEditing: props.finishEditing,
    isEditing: true,
    stopVoiceInput: props.stopVoiceInput ?? vi.fn(),
    voiceActive: props.voiceActive ?? false,
  });

  return (
    <div className="sniptale-callout">
      <div
        ref={contentEditableRef}
        className="sniptale-callout-editable"
        contentEditable
        suppressContentEditableWarning
      />
      <button data-ui="callout-voice-input" type="button">
        Voice
      </button>
    </div>
  );
}

function RestoredContentMeasureHarness(props: { htmlContent: string }) {
  const editing = useCalloutEditing({
    frameId: 'restored-frame',
    htmlContent: props.htmlContent,
    isEditing: false,
    onContentChange: vi.fn(),
    onDelete: vi.fn(),
    onStartEditing: vi.fn(),
    onStopEditing: vi.fn(),
    settingsKey: 'restored-callout',
  });

  return (
    <>
      <div ref={editing.containerRef} data-ui="restored-callout">
        <div ref={editing.contentEditableRef} />
      </div>
      <output data-ui="measured-width">{editing.dimensions.width}</output>
    </>
  );
}

function VoiceFocusLifecycleHarness(props: {
  onStopEditing: () => void;
  stopVoiceInput: () => void;
}) {
  const [voiceActive, setVoiceActive] = React.useState(true);
  const contentEditableRef = React.useRef<HTMLDivElement | null>(null);
  const handlers = useCalloutEditingHandlers({
    contentEditableRef,
    frameId: 'voice-focus-frame',
    isEditing: true,
    onContentChange: vi.fn(),
    onDelete: vi.fn(),
    onManualInput: vi.fn(),
    onStartEditing: vi.fn(),
    onStopEditing: props.onStopEditing,
  });
  useCalloutEscapeCaptureEffect({
    contentEditableRef,
    finishEditing: handlers.finishEditing,
    isEditing: true,
    stopVoiceInput: () => {
      props.stopVoiceInput();
      setVoiceActive(false);
    },
    voiceActive,
  });
  return (
    <div className="sniptale-callout">
      <div
        ref={contentEditableRef}
        contentEditable
        data-ui="voice-focus-editable"
        onBlur={handlers.handleBlur}
        suppressContentEditableWarning
      >
        Comment
      </div>
      <button data-ui="voice-focus-button" type="button">
        Voice
      </button>
    </div>
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

  it('stops active voice input before finishing the callout editor', () => {
    const finishEditing = vi.fn();
    const stopVoiceInput = vi.fn();
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
    act(() => {
      root?.render(
        <EscapeCaptureHarness
          finishEditing={finishEditing}
          stopVoiceInput={stopVoiceInput}
          voiceActive
        />
      );
    });
    const editable = container.querySelector<HTMLDivElement>('.sniptale-callout-editable');

    act(() => {
      editable?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(stopVoiceInput).toHaveBeenCalledOnce();
    expect(finishEditing).not.toHaveBeenCalled();
  });

  it('stops active voice input when Escape comes from the keyboard-focused microphone', () => {
    const finishEditing = vi.fn();
    const stopVoiceInput = vi.fn();
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
    act(() => {
      root?.render(
        <EscapeCaptureHarness
          finishEditing={finishEditing}
          stopVoiceInput={stopVoiceInput}
          voiceActive
        />
      );
    });
    const button = container.querySelector<HTMLButtonElement>('[data-ui="callout-voice-input"]');
    button?.focus();

    act(() => {
      button?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(stopVoiceInput).toHaveBeenCalledOnce();
    expect(finishEditing).not.toHaveBeenCalled();
  });

  it('keeps editing across keyboard focus and orders voice stop before editor finish', () => {
    const onStopEditing = vi.fn();
    const stopVoiceInput = vi.fn();
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
    act(() => {
      root?.render(
        <VoiceFocusLifecycleHarness onStopEditing={onStopEditing} stopVoiceInput={stopVoiceInput} />
      );
    });
    const editable = container.querySelector<HTMLElement>('[data-ui="voice-focus-editable"]');
    const button = container.querySelector<HTMLButtonElement>('[data-ui="voice-focus-button"]');

    editable?.focus();
    act(() => button?.focus());
    expect(onStopEditing).not.toHaveBeenCalled();

    act(() => {
      button?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(stopVoiceInput).toHaveBeenCalledOnce();
    expect(onStopEditing).not.toHaveBeenCalled();

    act(() => {
      button?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });
    expect(onStopEditing).toHaveBeenCalledOnce();
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

describe('restored callout measurement', () => {
  it('measures restored HTML after synchronizing it into the callout DOM', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getRestoredContentRect(this: HTMLElement) {
        const width = this.textContent?.includes('restored comment') ? 180 : 40;
        return new DOMRect(0, 0, width, 48);
      });

    act(() => {
      root?.render(<RestoredContentMeasureHarness htmlContent="<b>restored comment</b>" />);
    });

    expect(container.querySelector('[data-ui="restored-callout"]')?.textContent).toContain(
      'restored comment'
    );
    expect(container.querySelector('[data-ui="measured-width"]')?.textContent).toBe('180');
    rectSpy.mockRestore();
  });
});
