// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuidePageHeader } from './header';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function draw(options: { commandsDisabled?: boolean } = {}) {
  const appearance = vi.fn();
  const duplicate = vi.fn();
  const remove = vi.fn();
  const reload = vi.fn();
  const project = createGuideProject('Project', 'guide', 1);
  const t = createTranslator('en');
  await act(async () =>
    root.render(
      <GuidePageHeader
        project={project}
        status="failed"
        commandsDisabled={options.commandsDisabled ?? false}
        disabled={false}
        onAppearance={appearance}
        onDuplicate={duplicate}
        onDelete={remove}
        onReload={reload}
        onPreview={vi.fn()}
        previewRef={createRef<HTMLButtonElement>()}
        previewDisabled={false}
        canUndo={false}
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onChange={vi.fn()}
        t={t}
      />
    )
  );
  return { appearance, duplicate, remove, reload };
}

function headerButton(name: string) {
  const header = host.querySelector('.guide-page-header');
  return [...(header?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (entry) => entry.textContent?.trim() === name || entry.title === name
  );
}

it('shows Appearance as a persistent labeled header action outside the overflow menu', async () => {
  const { appearance } = await draw();
  const button = headerButton('Appearance');
  expect(button, 'persistent labeled Appearance action').toBeDefined();
  expect(button!.closest('.guide-action-menu')).toBeNull();
  await act(async () => button!.click());
  expect(appearance).toHaveBeenCalledOnce();
  const trigger = headerButton('Scenario')!;
  await act(async () => trigger.click());
  const menu = document.querySelector('.guide-action-menu');
  expect(menu).not.toBeNull();
  const labels = [...menu!.querySelectorAll<HTMLButtonElement>('button')].map((item) =>
    item.textContent?.trim()
  );
  expect(labels).toContain('Duplicate project');
  expect(labels).toContain('Delete project');
  expect(labels).not.toContain('Guide appearance');
  expect(labels).not.toContain('Appearance');
});

it('keeps Appearance enabled across an autosave lock while project mutations stay disabled', async () => {
  const { appearance, duplicate, remove, reload } = await draw({ commandsDisabled: true });
  const button = headerButton('Appearance')!;
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(appearance).toHaveBeenCalledOnce();
  const trigger = headerButton('Scenario')!;
  await act(async () => trigger.click());
  const items = [...document.querySelectorAll<HTMLButtonElement>('.guide-action-menu button')];
  for (const item of items) {
    expect(item.disabled).toBe(true);
    await act(async () => item.click());
  }
  expect(duplicate).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});
