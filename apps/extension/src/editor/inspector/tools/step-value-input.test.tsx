// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { StepValueInput } from './step-value-input';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it.each(['number', 'manual', 'letter'] as const)(
  'keeps %s badge wheel within its edit and commit contract',
  (type) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const preview = vi.fn();
    const commit = vi.fn();
    function Host() {
      const [settings, setSettings] = React.useState<
        React.ComponentProps<typeof StepValueInput>['settings']
      >({
        alphabet: 'latin',
        color: '#000000',
        opacity: 1,
        sizeLevel: 10,
        strokeColor: '#ffffff',
        strokeOpacity: 1,
        strokeWidth: 2,
        textColor: '#ffffff',
        type,
        value: type === 'letter' ? 'A' : '98',
      });
      return (
        <StepValueInput
          settings={settings}
          commitPendingSelectionSettings={commit}
          previewStepPatch={(patch) => {
            preview(patch);
            setSettings((current) => ({ ...current, ...patch }));
          }}
        />
      );
    }
    try {
      act(() => root.render(<Host />));
      const input = host.querySelector('input')!;
      act(() => input.focus());
      const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1 });
      act(() => input.dispatchEvent(wheel));
      expect(wheel.defaultPrevented).toBe(type === 'number');
      if (type === 'number') {
        expect(input.value).toBe('99');
        expect(preview).toHaveBeenLastCalledWith({ value: '99' });
        expect(commit).not.toHaveBeenCalled();
        act(() => {
          input.dispatchEvent(
            new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1 })
          );
          input.dispatchEvent(
            new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1 })
          );
        });
        expect(input.value).toBe('97');
      } else {
        expect(input.value).toBe(type === 'letter' ? 'A' : '98');
        expect(preview).not.toHaveBeenCalled();
      }
      act(() => input.blur());
      expect(commit).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  }
);

function renderDraftInput(type: 'number' | 'manual', value: string) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const previewStepPatch = vi.fn();
  const commitPendingSelectionSettings = vi.fn();
  act(() =>
    root.render(
      <StepValueInput
        commitPendingSelectionSettings={commitPendingSelectionSettings}
        previewStepPatch={previewStepPatch}
        settings={{
          alphabet: 'latin',
          color: '#000000',
          opacity: 1,
          sizeLevel: 10,
          strokeColor: '#ffffff',
          strokeOpacity: 1,
          strokeWidth: 2,
          textColor: '#ffffff',
          type,
          value,
        }}
      />
    )
  );
  const input = host.querySelector('input')!;
  const change = (text: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  const cleanup = () => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  };
  return { input, change, cleanup, previewStepPatch, commitPendingSelectionSettings };
}

it('normalizes step value edits through the shared input', () => {
  const field = renderDraftInput('number', '1');
  try {
    field.change('123abc');
    act(() =>
      field.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    );
    expect(field.input.getAttribute('aria-label')).toBe('editor.compact.stepValue');
    expect(field.input.className).toContain('text-center');
    expect(field.input.inputMode).toBe('numeric');
    expect(field.input.maxLength).toBe(2);
    expect(field.previewStepPatch).toHaveBeenCalledWith({ value: '12' });
    expect(field.commitPendingSelectionSettings).toHaveBeenCalledOnce();
  } finally {
    field.cleanup();
  }
});

it('allows manual step values up to three visible characters', () => {
  const field = renderDraftInput('manual', '');
  try {
    field.change('ABCD');
    expect(field.input.inputMode).toBe('text');
    expect(field.input.maxLength).toBe(3);
    expect(field.previewStepPatch).toHaveBeenCalledWith({ value: 'ABC' });
  } finally {
    field.cleanup();
  }
});
