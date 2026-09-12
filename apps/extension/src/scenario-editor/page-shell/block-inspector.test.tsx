// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGuideStep } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideBlockInspector } from './block-inspector';

it('disables mutations while retaining navigation to the step', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  const close = vi.fn();
  try {
    await act(async () =>
      root.render(
        <GuideBlockInspector
          item={createGuideStep('Step')}
          block={{ kind: 'note', id: 'note', paragraphs: [], tone: 'info' }}
          disabled
          onChange={change}
          onClose={close}
          t={createTranslator('en')}
        />
      )
    );
    const fields = host.querySelector('fieldset')!;
    expect(fields.disabled).toBe(true);
    for (const button of fields.querySelectorAll('button')) {
      expect(button.matches(':disabled')).toBe(true);
      await act(async () => button.click());
    }
    expect(change).not.toHaveBeenCalled();
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Step settings"]')!.click()
    );
    expect(close).toHaveBeenCalledOnce();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('edits typography without losing prose and removes metadata on reset', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const item = createGuideStep('Step');
  const source = {
    kind: 'note',
    id: 'note',
    paragraphs: [],
    tone: 'warning',
    width: 'half',
  } as const;
  let current: import('@sniptale/runtime-contracts/scenario/types/guide').GuideBlock = {
    ...source,
    paragraphs: [],
  };
  const update = (block: typeof current, group?: string | null) => {
    expect(group).toBeNull();
    current = block;
    draw();
  };
  const draw = () =>
    root.render(
      <GuideBlockInspector
        item={item}
        block={current}
        disabled={false}
        onChange={update}
        onClose={() => undefined}
        t={createTranslator('en')}
      />
    );
  const click = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(
      (node) =>
        (node.getAttribute('aria-label') ?? node.getAttribute('title') ?? node.textContent) ===
        label
    );
    if (!button) throw new Error(`Missing ${label}`);
    await act(async () => button.click());
  };
  try {
    await act(async () => draw());
    await click('Text size');
    const large = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (node) => node.textContent === 'Large'
    )!;
    await act(async () => large.click());
    await click('Center');
    expect(current).toEqual({ ...source, textStyle: { size: 'large', alignment: 'center' } });
    await click('Reset text appearance');
    expect(current).toEqual(source);
    expect(Object.hasOwn(current, 'textStyle')).toBe(false);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('shows a custom percentage without selecting either fixed preset', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <GuideBlockInspector
          item={createGuideStep('Step')}
          block={{ kind: 'text', id: 'text', paragraphs: [], width: 63 }}
          disabled={false}
          onChange={vi.fn()}
          onClose={vi.fn()}
          t={createTranslator('en')}
        />
      )
    );
    expect(host.textContent).toContain('63%');
    const group = host.querySelector('[aria-label="Block width"]')!;
    expect(group.querySelectorAll('button[aria-pressed="true"]')).toHaveLength(0);
    expect(group.querySelectorAll('button')).toHaveLength(2);
    expect(group.querySelector('[aria-hidden="true"]')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
