// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAppliedAiTargetHighlight, flashAppliedAiTargets } from './highlight';

function appendTarget(id: string) {
  const element = document.createElement('div');
  element.id = id;
  document.body.append(element);
  return element;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  clearAppliedAiTargetHighlight();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function registerBasicHighlightLifecycleTests() {
  it('adds and removes the transient class from connected targets', () => {
    const first = appendTarget('first');
    const second = appendTarget('second');

    flashAppliedAiTargets([first, second, first]);

    expect(first.classList.contains('sniptale-ai-apply-highlight')).toBe(true);
    expect(second.classList.contains('sniptale-ai-apply-highlight')).toBe(true);
    expect(first.style.getPropertyValue('background-color')).toContain('245, 228, 141');

    vi.advanceTimersByTime(2_400);

    expect(first.classList.contains('sniptale-ai-apply-highlight')).toBe(false);
    expect(second.classList.contains('sniptale-ai-apply-highlight')).toBe(false);
    expect(first.style.getPropertyValue('background-color')).toBe('');
  });

  it('replaces the previous highlight set when a new apply finishes before timeout', () => {
    const first = appendTarget('first');
    const second = appendTarget('second');

    flashAppliedAiTargets([first]);
    flashAppliedAiTargets([second]);

    expect(first.classList.contains('sniptale-ai-apply-highlight')).toBe(false);
    expect(second.classList.contains('sniptale-ai-apply-highlight')).toBe(true);
  });
}

function registerDetachedTargetHighlightTest(): void {
  it('ignores detached targets', () => {
    const detached = document.createElement('div');

    flashAppliedAiTargets([detached]);

    expect(detached.classList.contains('sniptale-ai-apply-highlight')).toBe(false);
  });
}

function registerTableRowHighlightTest(): void {
  it('highlights table row cells instead of relying on the row outline alone', () => {
    const row = document.createElement('tr');
    const firstCell = document.createElement('td');
    const secondCell = document.createElement('td');

    row.append(firstCell, secondCell);
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    body.append(row);
    table.append(body);
    document.body.append(table);

    flashAppliedAiTargets([row]);

    expect(row.classList.contains('sniptale-ai-apply-highlight')).toBe(false);
    expect(firstCell.classList.contains('sniptale-ai-apply-highlight')).toBe(true);
    expect(secondCell.classList.contains('sniptale-ai-apply-highlight')).toBe(true);
  });
}

function registerIframeTargetHighlightTest(): void {
  it('keeps iframe-owned elements highlightable across window boundaries', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc?.body || !iframe.contentWindow) {
      throw new Error('Expected iframe document');
    }

    Object.defineProperty(iframe.contentWindow, 'frameElement', {
      configurable: true,
      value: iframe,
    });

    const target = iframeDoc.createElement('a');
    target.textContent = 'Nested link';
    iframeDoc.body.append(target);

    flashAppliedAiTargets([target]);

    expect(target.classList.contains('sniptale-ai-apply-highlight')).toBe(true);
    expect(target.style.getPropertyValue('background-color')).toContain('245, 228, 141');
  });
}

function registerTargetTypeHighlightTests() {
  registerDetachedTargetHighlightTest();
  registerTableRowHighlightTest();
  registerIframeTargetHighlightTest();
}

describe('ai-pick dom-apply highlight', () => {
  registerBasicHighlightLifecycleTests();
  registerTargetTypeHighlightTests();
});
