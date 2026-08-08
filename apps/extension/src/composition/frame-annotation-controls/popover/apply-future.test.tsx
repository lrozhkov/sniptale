// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ApplyToFutureFramesGuard, useApplyToFutureFrames } from './apply-future';

afterEach(() => document.body.replaceChildren());

it('requires explicit confirmation before replacing future-frame settings', () => {
  const apply = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  function Harness() {
    const workflow = useApplyToFutureFrames(apply);
    return (
      <div>
        <button data-action="request" onClick={workflow.request} />
        {workflow.confirming ? (
          <ApplyToFutureFramesGuard onCancel={workflow.cancel} onConfirm={workflow.confirm} />
        ) : null}
      </div>
    );
  }

  act(() => root.render(<Harness />));
  act(() => host.querySelector<HTMLButtonElement>('[data-action="request"]')?.click());
  expect(apply).not.toHaveBeenCalled();
  const cancel = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Отмена'
  );
  act(() => cancel?.click());
  expect(apply).not.toHaveBeenCalled();
  expect(host.querySelector('[data-ui="content.template-fork.apply-to-future-guard"]')).toBeNull();

  act(() => host.querySelector<HTMLButtonElement>('[data-action="request"]')?.click());
  const confirm = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'Применить'
  );
  act(() => confirm?.click());
  expect(apply).toHaveBeenCalledOnce();
  expect(host.querySelector('[data-ui="content.template-fork.apply-to-future-guard"]')).toBeNull();

  act(() => root.unmount());
});

it('does not open or apply when a surface has no future-settings action', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  function Harness() {
    const workflow = useApplyToFutureFrames(undefined);
    return <button data-confirming={String(workflow.confirming)} onClick={workflow.request} />;
  }

  act(() => root.render(<Harness />));
  const button = host.querySelector<HTMLButtonElement>('button')!;
  act(() => button.click());
  expect(button.dataset['confirming']).toBe('false');
  act(() => root.unmount());
});
