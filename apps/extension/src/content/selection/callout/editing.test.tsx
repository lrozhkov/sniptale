// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { dispatchCalloutBlurRequest } from '../../platform/page-context/frame-events';
import { useCalloutEditing } from './editing';

function CalloutEditingLifecycleHarness(props: {
  onContentChange: (html: string) => void;
  onStopEditing: () => void;
}) {
  const [isEditing, setIsEditing] = React.useState(true);
  const editing = useCalloutEditing({
    frameId: 'frame-1',
    htmlContent: '<p>initial</p>',
    isEditing,
    onContentChange: props.onContentChange,
    onDelete: vi.fn(),
    onStartEditing: vi.fn(),
    onStopEditing: () => {
      props.onStopEditing();
      setIsEditing(false);
    },
    settingsKey: 'callout-key',
  });

  return (
    <div data-ui="callout-wrapper" onClick={editing.handleClick}>
      <input data-sniptale-callout-title="true" data-ui="callout-title" />
      <div
        ref={editing.contentEditableRef}
        contentEditable={isEditing}
        data-ui="callout-editable"
        onBlur={editing.handleBlur}
        onInput={editing.handleInput}
        onKeyDown={editing.handleKeyDown}
        onPaste={editing.handlePaste}
        suppressContentEditableWarning
      />
    </div>
  );
}

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
  vi.restoreAllMocks();
});

function renderHarness(props: {
  onContentChange: (html: string) => void;
  onStopEditing: () => void;
}): { editable: HTMLDivElement; title: HTMLInputElement; wrapper: HTMLDivElement } {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<CalloutEditingLifecycleHarness {...props} />);
  });

  const wrapper = container.querySelector<HTMLDivElement>('[data-ui="callout-wrapper"]');
  expect(wrapper).toBeInstanceOf(HTMLDivElement);
  const editable = container.querySelector<HTMLDivElement>('[data-ui="callout-editable"]');
  expect(editable).toBeInstanceOf(HTMLDivElement);
  const title = container.querySelector<HTMLInputElement>('[data-ui="callout-title"]');
  expect(title).toBeInstanceOf(HTMLInputElement);
  editable!.innerHTML = '<p>updated</p>';
  vi.spyOn(editable!, 'blur').mockImplementation(() => undefined);

  return { editable: editable!, title: title!, wrapper: wrapper! };
}

function mockHistoryTransactions() {
  const beginTransactionSpy = vi
    .spyOn(pagePreparationHistory, 'beginTransaction')
    .mockImplementation(() => true);
  const commitTransactionSpy = vi
    .spyOn(pagePreparationHistory, 'commitTransaction')
    .mockImplementation(() => true);

  return { beginTransactionSpy, commitTransactionSpy };
}

describe('useCalloutEditing external finish lifecycle', () => {
  it('commits the callout editing transaction when Enter finishes input', () => {
    const history = mockHistoryTransactions();
    const onContentChange = vi.fn();
    const onStopEditing = vi.fn();
    const { editable } = renderHarness({ onContentChange, onStopEditing });

    act(() => {
      editable.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })
      );
    });

    expect(onContentChange).toHaveBeenCalledWith('<p>updated</p>');
    expect(onStopEditing).toHaveBeenCalledTimes(1);
    expect(history.commitTransactionSpy).toHaveBeenCalledWith('callout-editing:frame-1');
  });

  it('commits the callout editing transaction when Escape finishes input', () => {
    const history = mockHistoryTransactions();
    const onContentChange = vi.fn();
    const onStopEditing = vi.fn();
    renderHarness({ onContentChange, onStopEditing });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(history.beginTransactionSpy).toHaveBeenCalledWith('callout-editing:frame-1');
    expect(onContentChange).toHaveBeenCalledWith('<p>updated</p>');
    expect(onStopEditing).toHaveBeenCalledTimes(1);
    expect(history.commitTransactionSpy).toHaveBeenCalledWith('callout-editing:frame-1');
  });

  it('commits the callout editing transaction when an outside click requests blur', () => {
    const history = mockHistoryTransactions();
    const onContentChange = vi.fn();
    const onStopEditing = vi.fn();
    renderHarness({ onContentChange, onStopEditing });

    act(() => {
      dispatchCalloutBlurRequest({ frameId: 'frame-1' });
    });

    expect(history.beginTransactionSpy).toHaveBeenCalledWith('callout-editing:frame-1');
    expect(onContentChange).toHaveBeenCalledWith('<p>updated</p>');
    expect(onStopEditing).toHaveBeenCalledTimes(1);
    expect(history.commitTransactionSpy).toHaveBeenCalledWith('callout-editing:frame-1');
  });
});

describe('useCalloutEditing callout click lifecycle', () => {
  it('commits the callout editing transaction when the callout cloud is clicked outside text', () => {
    const history = mockHistoryTransactions();
    const onContentChange = vi.fn();
    const onStopEditing = vi.fn();
    const { wrapper } = renderHarness({ onContentChange, onStopEditing });

    act(() => {
      wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(history.beginTransactionSpy).toHaveBeenCalledWith('callout-editing:frame-1');
    expect(onContentChange).toHaveBeenCalledWith('<p>updated</p>');
    expect(onStopEditing).toHaveBeenCalledTimes(1);
    expect(history.commitTransactionSpy).toHaveBeenCalledWith('callout-editing:frame-1');
  });

  it('keeps the callout editing transaction open when the editable text is clicked', () => {
    const history = mockHistoryTransactions();
    const onContentChange = vi.fn();
    const onStopEditing = vi.fn();
    const { editable } = renderHarness({ onContentChange, onStopEditing });

    act(() => {
      editable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(history.beginTransactionSpy).toHaveBeenCalledWith('callout-editing:frame-1');
    expect(onStopEditing).not.toHaveBeenCalled();
    expect(history.commitTransactionSpy).not.toHaveBeenCalled();
  });

  it('keeps editing when a text selection drag ends over the callout padding', () => {
    const history = mockHistoryTransactions();
    const onContentChange = vi.fn();
    const onStopEditing = vi.fn();
    const { editable, wrapper } = renderHarness({ onContentChange, onStopEditing });
    const textNode = editable.querySelector('p')?.firstChild;
    if (!textNode) throw new Error('Expected editable text');
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    selection?.removeAllRanges();
    selection?.addRange(range);

    act(() => {
      wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onStopEditing).not.toHaveBeenCalled();
    expect(history.commitTransactionSpy).not.toHaveBeenCalled();
    expect(selection?.toString()).toBe('upda');
  });

  it('keeps the callout editing transaction open when the title is clicked', () => {
    const history = mockHistoryTransactions();
    const onContentChange = vi.fn();
    const onStopEditing = vi.fn();
    const { title } = renderHarness({ onContentChange, onStopEditing });

    act(() => {
      title.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(history.beginTransactionSpy).toHaveBeenCalledWith('callout-editing:frame-1');
    expect(onStopEditing).not.toHaveBeenCalled();
    expect(history.commitTransactionSpy).not.toHaveBeenCalled();
  });
});
