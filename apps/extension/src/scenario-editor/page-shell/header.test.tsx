// @vitest-environment jsdom
import { act, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';
import { GuidePageHeader, GuidePageFeedback } from './header';
import { GuideLayoutAssistance } from './layout-assistance';

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
    feedback?: ReactNode;
    showSnap?: boolean;
    disabled?: boolean;
  } = {}
) {
  const autosave = vi.fn();
  const appearance = vi.fn();
  const duplicate = vi.fn();
  const remove = vi.fn();
  const reload = vi.fn();
  const change = vi.fn();
  const project = createGuideProject('Project', 'guide', 1);
  const t = createTranslator('en');
  await act(async () =>
    root.render(
      <GuideLayoutAssistance>
        <GuidePageHeader
          project={project}
          feedback={options.feedback}
          autosaveEnabled
          onAutosaveChange={autosave}
          status="failed"
          commandsDisabled={options.commandsDisabled ?? false}
          contextControls={options.contextControls}
          representationControls={options.representationControls}
          disabled={options.disabled ?? false}
          showSnap={options.showSnap ?? true}
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
          onChange={change}
          t={t}
        />
      </GuideLayoutAssistance>
    )
  );
  return { appearance, duplicate, remove, reload, autosave, change };
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
    'false'
  );
  await act(async () => anchor.querySelector<HTMLButtonElement>('button')!.click());
  await act(async () => document.querySelector<HTMLInputElement>('[role="switch"]')!.click());
  expect(autosave).toHaveBeenCalledWith(false);
});

it('keeps feedback outside the title and actions while exposing confirmed recovery', async () => {
  const reload = vi.fn(async () => {});
  const retry = vi.fn(async () => true);
  await draw({
    feedback: (
      <GuidePageFeedback
        status="failed"
        actionError={null}
        onRetry={retry}
        onReload={reload}
        disabled={false}
        t={createTranslator('en')}
      />
    ),
  });
  const header = host.querySelector('.guide-page-header')!;
  const feedback = host.querySelector('.guide-page-feedback')!;
  expect(header.contains(feedback)).toBe(false);
  expect(header.nextElementSibling).toBe(feedback);
  expect(feedback.querySelectorAll('[role="alert"]')).toHaveLength(1);
  expect(feedback.textContent).not.toContain('Saved');
  const buttons = [...feedback.querySelectorAll<HTMLButtonElement>('button')];
  await act(async () => buttons.find((button) => button.textContent === 'Retry')!.click());
  expect(retry).toHaveBeenCalledOnce();
  await act(async () => buttons.find((button) => button.textContent === 'Reload project')!.click());
  expect(reload).not.toHaveBeenCalled();
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain('Unsaved changes will be lost');
  await act(async () =>
    [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'Cancel')!
      .click()
  );
  expect(reload).not.toHaveBeenCalled();
});

it.each(['saved', 'dirty'] as const)(
  'distinguishes a failed operation from a %s document',
  async (status) => {
    const props = {
      status,
      actionError: 'copy' as const,
      onRetry: undefined,
      onReload: undefined,
      disabled: false,
      t: createTranslator('en'),
    };
    await act(async () => root.render(<GuidePageFeedback {...props} />));
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(host.textContent).toContain('Could not create a copy');
    expect(host.textContent).toContain(
      status === 'saved' ? 'The document is saved.' : 'Unsaved changes'
    );
    expect(host.querySelector('button')).toBeNull();
    await act(async () => root.render(<GuidePageFeedback {...props} />));
    expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1);
    await act(async () => root.render(<GuidePageFeedback {...props} actionError={null} />));
    expect(host.querySelector('.guide-page-feedback')).toBeNull();
  }
);

it('keeps Guide boundaries disposable, adjacent to snapping and independent of project updates', async () => {
  const { change } = await draw();
  const button = () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Show boundaries"]')!;
  expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(button().previousElementSibling?.querySelector('.lucide-magnet')).not.toBeNull();
  await act(async () => button().click());
  expect(button().getAttribute('aria-pressed')).toBe('true');
  expect(change).not.toHaveBeenCalled();
  await draw({ showSnap: false });
  expect(button()).toBeNull();
  await draw({ disabled: true });
  expect(button().getAttribute('aria-pressed')).toBe('true');
  expect(button().disabled).toBe(true);
  await act(async () => button().click());
  expect(button().getAttribute('aria-pressed')).toBe('true');
});
