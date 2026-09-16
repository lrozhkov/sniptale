// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideProjectActions } from './project-actions';

it('keeps appearance available across an autosave lock while project mutations remain disabled', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const appearance = vi.fn();
  const duplicate = vi.fn();
  const remove = vi.fn();
  const reload = vi.fn();
  const project = createGuideProject('Project');
  const draw = async (disabled: boolean) =>
    act(async () =>
      root.render(
        <GuideProjectActions
          project={project}
          disabled={disabled}
          status="failed"
          t={createTranslator('en')}
          onAppearance={appearance}
          onDuplicate={duplicate}
          onDelete={remove}
          onReload={reload}
        />
      )
    );
  try {
    await draw(false);
    const trigger = host.querySelector('button')!;
    await act(async () => trigger.click());
    expect(document.querySelector('.guide-action-menu')).not.toBeNull();
    await draw(true);
    const menu = document.querySelector('.guide-action-menu');
    expect(menu).not.toBeNull();
    const items = [...menu!.querySelectorAll<HTMLButtonElement>('button')];
    const settings = items.find((item) => item.textContent?.trim() === 'Guide appearance')!;
    expect(settings.disabled).toBe(false);
    for (const item of items.filter((item) => item !== settings)) {
      expect(item.disabled).toBe(true);
      await act(async () => item.click());
    }
    expect(duplicate).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    await act(async () => settings.click());
    expect(appearance).toHaveBeenCalledOnce();
    await draw(false);
    await act(async () => trigger.click());
    expect(
      [...document.querySelectorAll<HTMLButtonElement>('.guide-action-menu button')].every(
        (item) => !item.disabled
      )
    ).toBe(true);
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
