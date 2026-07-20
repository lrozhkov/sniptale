// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   exact color-control part proof keeps trigger and expanded panel branches together */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../../ui/compact-inspector-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/compact-inspector-controls')>()),
  COMPACT_INSPECTOR_CONTROL_CLASS_NAME: 'rounded-[10px] border',
  CompactColorOption: ({
    active: _active,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
    <button type="button" {...props} />
  ),
}));

vi.mock('../ui/primitives', async (importOriginal) => ({
  ...(await importOriginal()),
  cx: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' '),
}));

import { ColorControlTrigger, EditorColorControlExpandedPanel } from './parts';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
}

function cleanupDom() {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
}

afterEach(cleanupDom);

function getActionRowProps(props: React.ComponentProps<typeof EditorColorControlExpandedPanel>) {
  const panel = EditorColorControlExpandedPanel(props) as React.ReactElement<{
    children: React.ReactNode;
  }>;
  const children = React.Children.toArray(panel.props.children);
  const actionRow = children[children.length - 1] as React.ReactElement;
  return actionRow.props as {
    applyDisabled: boolean;
    draftColor: string;
    onApplyDraft: () => void;
    onDraftChange: (value: string) => void;
    onSelectNone: () => void;
  };
}

function buildColorRange(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `#${prefix}${String(index).padStart(4, '0')}`);
}

function queryLabel(label: string) {
  return Array.from(container?.querySelectorAll('div') ?? []).find(
    (element) => element.children.length === 0 && element.textContent === label
  );
}

function queryButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

function queryColorInput() {
  return container?.querySelector('input[type="color"]') as HTMLInputElement | null;
}

describe('editor/color-control parts', () => {
  it('renders the trigger with the transparent swatch state', async () => {
    const onToggle = vi.fn();

    await renderNode(
      <ColorControlTrigger
        displayValue="Transparent"
        expanded
        normalizedValue="transparent"
        selectedColor="#123456"
        title="Grid color"
        onToggle={onToggle}
      />
    );

    const button = container?.querySelector('button');
    const swatch = container?.querySelector('span.h-5.w-5') as HTMLSpanElement | null;

    expect(button?.getAttribute('aria-expanded')).toBe('true');
    expect(swatch?.className).toContain('bg-[linear-gradient');
    expect(swatch?.style.backgroundColor).toBe('transparent');

    await act(async () => {
      button?.click();
    });

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders the trigger with a solid swatch when a non-transparent color is selected', async () => {
    await renderNode(
      <ColorControlTrigger
        displayValue="#123456"
        expanded={false}
        normalizedValue="#123456"
        selectedColor="#123456"
        title="Grid color"
        onToggle={() => undefined}
      />
    );

    const button = container?.querySelector('button');
    const swatch = container?.querySelector('span.h-5.w-5') as HTMLSpanElement | null;

    expect(button?.getAttribute('aria-expanded')).toBe('false');
    expect(swatch?.className).not.toContain('bg-[linear-gradient');
    expect(swatch?.style.backgroundColor).toBe('rgb(18, 52, 86)');
  });

  it('renders capped single-row sections and transparent/apply actions', async () => {
    const onChange = vi.fn();
    const onSelectNone = vi.fn();

    await renderNode(
      <EditorColorControlExpandedPanel
        palette={buildColorRange('aa', 12)}
        recentColors={buildColorRange('11', 11)}
        applyDisabled
        draftColor="#123456"
        selectedColor="#123456"
        title="Grid color"
        onApplyDraft={() => undefined}
        onChange={onChange}
        onDraftChange={() => undefined}
        onSelectNone={onSelectNone}
      />
    );

    const swatches = Array.from(container?.querySelectorAll('button') ?? []).filter((button) =>
      button.getAttribute('title')?.startsWith('Grid color:')
    );

    expect(swatches).toHaveLength(20);
    expect(container?.innerHTML.match(/grid-cols-10/g)?.length).toBe(2);
    expect(queryLabel('editor.compact.recentColors')?.className).toContain('text-[12px]');
    expect(queryLabel('editor.compact.palette')?.className).not.toContain('tracking-[0.08em]');
    expect(container?.textContent).toContain('editor.compact.recentColors');
    expect(container?.textContent).toContain('editor.compact.palette');
    expect(container?.textContent).toContain('editor.runtime.transparent');
    expect(container?.textContent).toContain('editor.compact.apply');
    expect(container?.textContent).not.toContain('editor.compact.none');
    expect(container?.textContent).not.toContain('editor.compact.choose');

    await act(async () => {
      swatches[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      queryButton('editor.runtime.transparent')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });

    expect(onChange).toHaveBeenCalledWith('#110000');
    expect(onSelectNone).toHaveBeenCalledOnce();
  });

  it('routes native draft and apply actions without preview passthrough', async () => {
    const onChange = vi.fn();
    const onSelectNone = vi.fn();

    const actionRow = getActionRowProps({
      palette: ['#abcdef'],
      recentColors: ['#123456'],
      applyDisabled: false,
      draftColor: '#654321',
      selectedColor: '#123456',
      title: 'Grid color',
      onApplyDraft: () => onChange('#654321'),
      onChange,
      onDraftChange: () => undefined,
      onSelectNone,
    });

    actionRow.onDraftChange('#654321');
    expect(onChange).not.toHaveBeenCalledWith('#654321');

    actionRow.onApplyDraft();
    expect(onChange).toHaveBeenCalledWith('#654321');
  });

  it('disables apply when the draft matches the applied color', async () => {
    const onChange = vi.fn();

    await renderNode(
      <EditorColorControlExpandedPanel
        palette={['#abcdef']}
        recentColors={[]}
        applyDisabled
        draftColor="#abcdef"
        selectedColor="#abcdef"
        title="Grid color"
        onApplyDraft={() => undefined}
        onChange={onChange}
        onDraftChange={() => undefined}
        onSelectNone={() => undefined}
      />
    );

    const actionRow = getActionRowProps({
      palette: ['#abcdef'],
      recentColors: [],
      applyDisabled: true,
      draftColor: '#abcdef',
      selectedColor: '#abcdef',
      title: 'Grid color',
      onApplyDraft: () => undefined,
      onChange,
      onDraftChange: () => undefined,
      onSelectNone: () => undefined,
    });

    expect(actionRow.applyDisabled).toBe(true);
    expect(queryButton('editor.compact.apply')?.disabled).toBe(true);
  });

  it('forwards native color picker input and change events into the draft handler', async () => {
    const onDraftChange = vi.fn();

    await renderNode(
      <EditorColorControlExpandedPanel
        palette={['#abcdef']}
        recentColors={[]}
        applyDisabled={false}
        draftColor="#abcdef"
        selectedColor="#abcdef"
        title="Grid color"
        onApplyDraft={() => undefined}
        onChange={() => undefined}
        onDraftChange={onDraftChange}
        onSelectNone={() => undefined}
      />
    );

    await act(async () => {
      queryColorInput()!.value = '#00ff00';
      queryColorInput()!.dispatchEvent(new Event('input', { bubbles: true }));
      queryColorInput()!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onDraftChange).toHaveBeenCalledWith('#00ff00');
  });
});
