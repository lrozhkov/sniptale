/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: vi.fn((key: string) => key),
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { EditorInspectorSizePanel } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('EditorInspectorSizePanel', () => {
  it('renders compact size controls with inline aspect action and apply button', () => {
    const onApply = vi.fn();
    const onToggleLock = vi.fn();

    render(
      <EditorInspectorSizePanel
        label="Canvas"
        valueText="1200 × 800"
        width={1200}
        height={800}
        locked
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        onToggleLock={onToggleLock}
        onApply={onApply}
      />
    );

    const lockButton = container?.querySelector(
      'button[title="editor.compact.keepAspectRatio"]'
    ) as HTMLButtonElement | null;
    const applyButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes('editor.compact.apply')
    ) as HTMLButtonElement | undefined;
    const rowChildren = Array.from(
      container?.querySelector('[data-size-panel-dimensions]')?.children ?? []
    );

    act(() => {
      lockButton?.click();
      applyButton?.click();
    });

    expect(container?.textContent).toContain('Canvas');
    expect(container?.textContent).toContain('1200 × 800');
    expect(container?.querySelector('section')).toBeNull();
    expect(container?.querySelector('[data-size-panel-dimensions]')).not.toBeNull();
    expect(rowChildren).toHaveLength(3);
    expect(rowChildren[0]?.querySelector('[aria-label="editor.compact.widthDimension"]')).not.toBe(
      null
    );
    expect(rowChildren[1]?.getAttribute('title')).toBe('editor.compact.keepAspectRatio');
    expect(
      rowChildren[2]?.querySelector('[aria-label="editor.compact.heightDimension"]')
    ).not.toBeNull();
    expect(applyButton?.className).toContain('border-none');
    expect(applyButton?.className).toContain('h-10 min-h-10');
    expect(onToggleLock).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('omits the section value when it is empty', () => {
    render(
      <EditorInspectorSizePanel
        label="Canvas"
        valueText=""
        width={1}
        height={1}
        locked={false}
        onWidthChange={vi.fn()}
        onHeightChange={vi.fn()}
        onToggleLock={vi.fn()}
        onApply={vi.fn()}
      />
    );

    expect(container?.textContent).not.toContain('undefined');
  });
});
