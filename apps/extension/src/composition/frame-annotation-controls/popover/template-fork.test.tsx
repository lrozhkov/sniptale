// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { TemplateForkReturnGuard, useTemplateForkWorkflow } from './template-fork';

afterEach(() => {
  document.body.replaceChildren();
});

it('keeps a temporary fork isolated until it is saved or explicitly discarded', () => {
  const fork = vi.fn();
  const restore = vi.fn();
  const refresh = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);

  function Harness() {
    const workflow = useTemplateForkWorkflow({
      activeTemplateId: 'template-a',
      onFork: fork,
      onRestore: restore,
      onShowTemplates: refresh,
      templates: [{ id: 'template-a' }],
    });
    return (
      <div>
        <output data-mode={workflow.mode} data-save-request={workflow.saveRequest} />
        <button data-action="fork" onClick={() => workflow.fork()} />
        <button data-action="back" onClick={workflow.requestTemplates} />
        <button data-action="complete" onClick={workflow.completeSave} />
        {workflow.confirmingReturn ? (
          <TemplateForkReturnGuard
            onContinue={workflow.continueEditing}
            onDiscard={workflow.discard}
            onGoToSave={workflow.goToSave}
          />
        ) : null}
      </div>
    );
  }

  const root = createRoot(host);
  act(() => root.render(<Harness />));
  click(host, '[data-action="fork"]');
  expect(fork).toHaveBeenCalledWith({ id: 'template-a' });
  expect(host.querySelector('output')?.getAttribute('data-mode')).toBe('temporary');

  click(host, '[data-action="back"]');
  expect(host.querySelector('[data-ui="content.template-fork.return-guard"]')).not.toBeNull();
  clickButton(host, 'Перейти к сохранению');
  expect(host.querySelector('output')?.getAttribute('data-save-request')).toBe('1');
  expect(restore).not.toHaveBeenCalled();

  click(host, '[data-action="back"]');
  clickButton(host, 'Отбросить изменения');
  expect(restore).toHaveBeenCalledWith({ id: 'template-a' });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(host.querySelector('output')?.getAttribute('data-mode')).toBe('templates');

  act(() => root.unmount());
});

function click(host: HTMLElement, selector: string) {
  act(() => host.querySelector<HTMLButtonElement>(selector)?.click());
}

function clickButton(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === label);
  act(() => button?.click());
}
