// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuideProjectActions } from './project-actions';

it('keeps project mutations in the overflow menu disabled across an autosave lock', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const duplicate = vi.fn();
  const remove = vi.fn();
  const project = createGuideProject('Project');
  const draw = async (disabled: boolean) =>
    act(async () =>
      root.render(
        <GuideProjectActions
          project={project}
          disabled={disabled}
          t={createTranslator('en')}
          onDuplicate={duplicate}
          onDelete={remove}
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
    const labels = items.map((item) => item.textContent?.trim());
    expect(labels).toContain('Duplicate project');
    expect(labels).not.toContain('Reload project');
    expect(labels).toContain('Delete project');
    expect(labels).not.toContain('Guide appearance');
    for (const item of items) {
      expect(item.disabled).toBe(true);
      await act(async () => item.click());
    }
    expect(duplicate).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
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
