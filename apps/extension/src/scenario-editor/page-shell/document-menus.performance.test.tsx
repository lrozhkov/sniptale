// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject, createGuideStep } from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';

const renders = vi.hoisted(() => ({ insertion: vi.fn(), actions: vi.fn() }));
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Ellipsis(props: ComponentProps<typeof actual.Ellipsis>) {
      renders.insertion();
      return <actual.Ellipsis {...props} />;
    },
    MoreHorizontal(props: ComponentProps<typeof actual.MoreHorizontal>) {
      renders.actions();
      return <actual.MoreHorizontal {...props} />;
    },
  };
});

import { GuideDocument } from './guide-document';
import { GuideDocumentInsert, GuideInsertScope } from './document-insert';
import { GuideLayoutAssistance } from './layout-assistance';
import { GuideStepActions } from './step-actions';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  renders.insertion.mockClear();
  renders.actions.mockClear();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(100, 100, 32, 32)
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function documentProps(): ComponentProps<typeof GuideDocument> {
  const project = createGuideProject('Original', 'project', 1);
  project.items = [0, 1, 2].map((index) => createGuideStep(`Step ${index}`, `step-${index}`));
  return {
    project,
    selectedId: null,
    focusRequest: { sequence: 0 },
    images: {},
    disabled: false,
    onChange: vi.fn(),
    onOperate: vi.fn(),
    onEditImage: vi.fn(),
    onUploadImage: async () => false,
    framedImageId: null,
    onFrameImage: vi.fn(),
    onSelectBlock: vi.fn(),
    t: createTranslator('en'),
  };
}

async function renderDocument(props: ComponentProps<typeof GuideDocument>) {
  await act(async () =>
    root.render(
      <GuideLayoutAssistance>
        <GuideDocument {...props} />
      </GuideLayoutAssistance>
    )
  );
}

function menuButton(text: string) {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>('.guide-action-menu button'),
  ].find(
    (element) => element.textContent?.includes(text) || element.getAttribute('title') === text
  );
  if (!button) throw new Error(`Missing menu command ${text}`);
  return button;
}

it('keeps actual insertion and item action triggers quiet for unrelated document metadata', async () => {
  const props = documentProps();
  await renderDocument(props);
  expect(renders.actions).toHaveBeenCalledTimes(3);
  expect(renders.insertion.mock.calls.length).toBeGreaterThan(0);
  renders.actions.mockClear();
  renders.insertion.mockClear();

  await renderDocument({
    ...props,
    project: { ...props.project, name: 'Latest name', updatedAt: 2 },
    onOperate: vi.fn(),
  });

  expect(renders.actions).not.toHaveBeenCalled();
  expect(renders.insertion).not.toHaveBeenCalled();
  expect(host.querySelectorAll('.guide-item-actions')).toHaveLength(3);
});

it('retains insertion work for equal target identities and applies newer target and callback', async () => {
  const first = vi.fn();
  const latest = vi.fn();
  const t = createTranslator('en');
  const breaks: string[] = [];
  const render = async (before: string, onOperate: typeof first) =>
    act(async () =>
      root.render(
        <GuideInsertScope value={false} breaks={breaks}>
          <GuideDocumentInsert
            target={{ kind: 'item', beforeItemId: before }}
            disabled={false}
            onOperate={onOperate}
            t={t}
          />
        </GuideInsertScope>
      )
    );
  await render('first', first);
  renders.insertion.mockClear();
  await render('first', first);
  expect(renders.insertion).not.toHaveBeenCalled();

  await render('next', latest);
  await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
  await act(async () => menuButton('Add step').click());
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith({ kind: 'add-step', beforeItemId: 'next' });
});

it('updates open item menu availability and its current handler after reordering', async () => {
  const project = createGuideProject('Guide', 'guide', 1);
  const firstStep = createGuideStep('First', 'first');
  const lastStep = createGuideStep('Last', 'last');
  project.items = [firstStep, lastStep];
  const first = vi.fn();
  const latest = vi.fn();
  const t = createTranslator('en');
  await act(async () =>
    root.render(
      <GuideStepActions project={project} itemId="first" disabled={false} onOperate={first} t={t} />
    )
  );
  await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
  expect(menuButton('Move up').disabled).toBe(true);
  expect(menuButton('Move down').disabled).toBe(false);
  expect(menuButton('Merge with next').disabled).toBe(false);

  await act(async () =>
    root.render(
      <GuideStepActions
        project={{ ...project, items: [lastStep, firstStep] }}
        itemId="first"
        disabled={false}
        onOperate={latest}
        t={t}
      />
    )
  );
  expect(menuButton('Move up').disabled).toBe(false);
  expect(menuButton('Move down').disabled).toBe(true);
  expect(menuButton('Merge with next').disabled).toBe(true);
  await act(async () => menuButton('Duplicate').click());
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith({ kind: 'duplicate-item', itemId: 'first' });
});

it('keeps section labels, current locale and disabled controls visible after menu retention', async () => {
  const project = createGuideProject('Guide', 'guide', 1);
  project.items = [{ kind: 'section', id: 'section', title: 'Section', paragraphs: [] }];
  const onOperate = vi.fn();
  const t = createTranslator('en');
  const draw = async (disabled: boolean, translator: typeof t) =>
    act(async () =>
      root.render(
        <GuideStepActions
          project={project}
          itemId="section"
          disabled={disabled}
          onOperate={onOperate}
          t={translator}
        />
      )
    );
  await draw(false, t);
  const trigger = host.querySelector<HTMLButtonElement>('button')!;
  expect(trigger.getAttribute('aria-label')).toBe('Section actions');
  await act(async () => trigger.click());
  expect(document.querySelector('.guide-action-menu')?.textContent).not.toContain('Merge');

  await draw(true, createTranslator('ru'));
  expect(trigger.getAttribute('aria-label')).toBe('Действия с разделом');
  expect(trigger.disabled).toBe(true);
  expect(document.querySelector('.guide-action-menu')).toBeNull();
  expect(onOperate).not.toHaveBeenCalled();
});
