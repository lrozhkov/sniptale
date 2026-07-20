// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  useInteractiveFrameEditingKeyboardEffect,
  useInteractiveFrameEditingOverlayEffect,
} from './edit-mode-effects';

const setFrameEditing = vi.fn();
const clearFrameEditing = vi.fn();

vi.mock('../../highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../highlighter')>()),
  clearFrameEditing: (...args: unknown[]) => clearFrameEditing(...args),
  setFrameEditing: (...args: unknown[]) => setFrameEditing(...args),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  setFrameEditing.mockReset();
  clearFrameEditing.mockReset();
});

function renderHarness(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(node);
  });
}

function KeyboardEffectHarness(props: {
  onCancel: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const handleCancelRef = React.useRef(props.onCancel);
  const handleDeleteRef = React.useRef(props.onDelete);
  const handleSaveRef = React.useRef(props.onSave);

  useInteractiveFrameEditingKeyboardEffect({
    handleCancelRef,
    handleDeleteRef,
    handleSaveRef,
    state: 'editing',
  });

  return (
    <div contentEditable suppressContentEditableWarning>
      editable
    </div>
  );
}

function OverlayEffectHarness(props: {
  isCalloutEditing: boolean;
  state: 'idle' | 'hover' | 'editing';
}) {
  useInteractiveFrameEditingOverlayEffect(props.state, props.isCalloutEditing);
  return <div>overlay</div>;
}

describe('interactive frame editing keyboard effect', () => {
  it('ignores frame hotkeys while typing in contentEditable callout content', () => {
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    const onSave = vi.fn();

    renderHarness(
      <KeyboardEffectHarness onCancel={onCancel} onDelete={onDelete} onSave={onSave} />
    );

    const editable = container?.querySelector('div[contenteditable="true"]');
    expect(editable).toBeInstanceOf(HTMLElement);

    act(() => {
      editable?.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          key: 'Enter',
        })
      );
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('interactive frame editing keyboard effect shadow targets', () => {
  it('ignores delete hotkeys from inputs inside shadow portal content', () => {
    const onCancel = vi.fn();
    const onDelete = vi.fn();
    const onSave = vi.fn();

    renderHarness(
      <KeyboardEffectHarness onCancel={onCancel} onDelete={onDelete} onSave={onSave} />
    );

    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    shadowRoot.append(input);
    document.body.append(host);

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          composed: true,
          key: 'Backspace',
        })
      );
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    host.remove();
  });
});

describe('interactive frame editing overlay effect', () => {
  it('suppresses the highlighter while callout editing is active', () => {
    const overlayContainer = document.createElement('div');
    overlayContainer.className = 'sniptale-highlight-container';
    document.body.appendChild(overlayContainer);

    renderHarness(<OverlayEffectHarness isCalloutEditing state="hover" />);

    expect(setFrameEditing).toHaveBeenCalledTimes(1);
    expect(overlayContainer.classList.contains('sniptale-hidden-during-edit')).toBe(true);

    act(() => {
      root?.unmount();
    });
    root = null;

    expect(clearFrameEditing).toHaveBeenCalledTimes(1);
    expect(overlayContainer.classList.contains('sniptale-hidden-during-edit')).toBe(false);

    overlayContainer.remove();
  });
});
