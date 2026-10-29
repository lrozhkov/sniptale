// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { translate } from '../../../../../platform/i18n';
import { AIModalSelectionFeedback } from './model-selector';

it('keeps pending selection feedback outside layout and preserves visible failure recovery', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const retry = vi.fn();
  const selection: ComponentProps<typeof AIModalSelectionFeedback>['selection'] = {
    configuration: null,
    modelId: null,
    configurationFailed: false,
    selectionPending: true,
    selectionFailed: false,
    selectionUnavailable: false,
    unavailableModelName: null,
    chooseModel: vi.fn(),
    prepareModelSelection: vi.fn(),
    retryConfiguration: retry,
  };
  try {
    await act(async () => root.render(<AIModalSelectionFeedback selection={selection} />));
    const pending = host.querySelector('[role="status"]')!;
    expect(pending.textContent).toBe(translate('common.states.saving'));
    expect(pending.classList.contains('sr-only')).toBe(true);
    await act(async () =>
      root.render(
        <AIModalSelectionFeedback
          selection={{
            ...selection,
            selectionPending: false,
            selectionUnavailable: true,
            unavailableModelName: '<unavailable model>',
            selectionFailed: true,
            configurationFailed: true,
          }}
        />
      )
    );
    const unavailable = host.querySelector('[role="status"]')!;
    expect(unavailable.classList.contains('sr-only')).toBe(false);
    expect(unavailable.textContent).toContain('<unavailable model>');
    expect(unavailable.querySelector('unavailable')).toBeNull();
    const errors = [...host.querySelectorAll('[role="alert"]')];
    expect(errors).toHaveLength(2);
    expect(errors.every((error) => !error.classList.contains('sr-only'))).toBe(true);
    expect(host.textContent).toContain(translate('aiModal.modelSelectionSaveFailed'));
    await act(async () => host.querySelector('button')!.click());
    expect(retry).toHaveBeenCalledOnce();
    await act(async () =>
      root.render(
        <AIModalSelectionFeedback selection={{ ...selection, selectionPending: false }} />
      )
    );
    expect(host.textContent).toBe('');
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
