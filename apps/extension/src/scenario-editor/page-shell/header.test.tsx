// @vitest-environment jsdom
import { act, createRef, type ReactNode } from 'react';
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

async function draw(
  options: {
    commandsDisabled?: boolean;
    appearanceActive?: boolean;
    contextControls?: ReactNode;
    representationControls?: ReactNode;
  } = {}
) {
  const autosave = vi.fn();
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
        autosaveEnabled
        onAutosaveChange={autosave}
        status="failed"
        commandsDisabled={options.commandsDisabled ?? false}
        contextControls={options.contextControls}
        representationControls={options.representationControls}
        disabled={false}
        onAppearance={appearance}
        appearanceActive={options.appearanceActive ?? false}
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
  return { appearance, duplicate, remove, reload, autosave };
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

it('renders contextual controls between the project title and the representation switch', async () => {
  await draw({
    contextControls: <div className="context-slot">context</div>,
    representationControls: <div className="representation-slot">switch</div>,
  });
  const header = host.querySelector('.guide-page-header')!;
  const title = header.querySelector('.guide-project-name')!;
  const context = header.querySelector('.context-slot')!;
  const representation = header.querySelector('.representation-slot')!;
  expect(context.closest('.guide-header-actions')).not.toBeNull();
  expect(title.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(
    representation.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(
    representation.compareDocumentPosition(headerButton('Appearance')!) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
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

it('reports appearance selection from the inspector scope without owning another state', async () => {
  await draw({ appearanceActive: true });
  const button = () => host.querySelector<HTMLButtonElement>('button[title="Appearance"]')!;
  expect(button().getAttribute('aria-pressed')).toBe('true');
  await draw({ appearanceActive: false });
  expect(button().getAttribute('aria-pressed')).toBe('false');
});

it('places autosave between history and menu and forwards the switch', async () => {
  const { autosave } = await draw();
  const anchor = host.querySelector('[data-ui="autosave-control"]')!;
  expect(anchor.previousElementSibling?.className).toContain('w-px');
  expect(anchor.previousElementSibling?.previousElementSibling?.className).toContain(
    'guide-history-controls'
  );
  expect(anchor.querySelector<HTMLButtonElement>('button')?.getAttribute('aria-expanded')).toBe(
    'true'
  );
  await act(async () => document.querySelector<HTMLInputElement>('[role="switch"]')!.click());
  expect(autosave).toHaveBeenCalledWith(false);
});
