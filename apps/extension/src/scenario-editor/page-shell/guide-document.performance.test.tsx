// @vitest-environment jsdom

import { act, startTransition, Suspense, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import { reduceGuideHistory } from './runtime/history';

import {
  createGuideParagraphs,
  createGuideProject,
  createGuideStep,
} from '../../features/scenario/project/public';
import { createTranslator } from '../../platform/i18n';

const renders = vi.hoisted(() => vi.fn());
vi.mock('./voice-field', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./voice-field')>();
  return {
    ...actual,
    GuideVoiceField(props: Parameters<typeof actual.GuideVoiceField>[0]) {
      renders(props['aria-label']);
      return <actual.GuideVoiceField {...props} />;
    },
  };
});

import { GuideDocument } from './guide-document';
import { GuideLayoutAssistance } from './layout-assistance';
import { useGuideDocumentCommands } from './guide-document-commands';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  renders.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function createProps(): ComponentProps<typeof GuideDocument> {
  const project = createGuideProject('Original name', 'project', 1);
  project.items = Array.from({ length: 3 }, (_, index) => ({
    ...createGuideStep(`Step ${index}`, `step-${index}`),
    blocks: Array.from({ length: 2 }, (_, block) => ({
      kind: 'text' as const,
      id: `block-${index}-${block}`,
      paragraphs: createGuideParagraphs(`Body ${index}-${block}`),
    })),
  }));
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

async function render(props: ComponentProps<typeof GuideDocument>) {
  await act(async () =>
    root.render(
      <GuideLayoutAssistance>
        <GuideDocument {...props} />
      </GuideLayoutAssistance>
    )
  );
}

async function input(selector: string, value: string) {
  const field = host.querySelector<HTMLTextAreaElement>(selector);
  if (!field) throw new Error('Missing actual guide text field');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      field,
      value
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

it('does not rerender unchanged step fields for project metadata or newer command callbacks', async () => {
  const props = createProps();
  await render(props);
  expect(renders).toHaveBeenCalledTimes(9);
  renders.mockClear();

  await render({
    ...props,
    project: { ...props.project, name: 'New name', updatedAt: 2 },
    onChange: vi.fn(),
    onOperate: vi.fn(),
  });

  expect(renders).not.toHaveBeenCalled();
  expect(host.querySelectorAll('textarea')).toHaveLength(9);
});

it('keeps unchanged fields quiet through a canonical autosave publication and edits latest metadata', async () => {
  const props = createProps();
  const initial = parseGuideProject(props.project);
  if (initial.status !== 'ok') throw new Error('Invalid source fixture');
  props.project = initial.project;
  await render(props);
  renders.mockClear();
  const published = parseGuideProject({ ...props.project, name: 'Saved name', updatedAt: 2 });
  if (published.status !== 'ok') throw new Error('Invalid published fixture');
  const state = reduceGuideHistory(
    { present: props.project, past: [], future: [], group: null },
    {
      kind: 'publish',
      source: props.project,
      project: published.project,
    }
  );
  if (!state.present) throw new Error('Missing published buffer');
  await render({ ...props, project: state.present });
  expect(renders).not.toHaveBeenCalled();
  await input('#step-0 .guide-step-title', 'Latest title');
  expect(props.onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Saved name',
      updatedAt: 2,
      items: expect.arrayContaining([
        expect.objectContaining({ id: 'step-0', title: 'Latest title' }),
      ]),
    }),
    'step-title:step-0'
  );
});

it('rerenders only the changed step fields when a sibling item changes', async () => {
  const props = createProps();
  await render(props);
  renders.mockClear();
  const items = props.project.items.map((item) =>
    item.id === 'step-1' ? { ...item, title: 'Changed step' } : item
  );

  await render({ ...props, project: { ...props.project, items } });

  expect(renders).toHaveBeenCalledTimes(3);
  expect(host.querySelector<HTMLTextAreaElement>('#step-1 .guide-step-title')?.value).toBe(
    'Changed step'
  );
});

it('uses the latest committed metadata, sibling content and change handler from retained fields', async () => {
  const props = createProps();
  const firstHandler = vi.fn();
  const latestHandler = vi.fn();
  await render({ ...props, onChange: firstHandler });
  const items = props.project.items.map((item) =>
    item.id === 'step-1' ? { ...item, title: 'Keep sibling edit' } : item
  );
  const current = { ...props.project, name: 'Latest name', updatedAt: 9, items };
  await render({ ...props, project: current, onChange: latestHandler });
  renders.mockClear();

  await input('#step-0 .guide-step-title', 'Latest step edit');

  expect(firstHandler).not.toHaveBeenCalled();
  expect(latestHandler).toHaveBeenCalledOnce();
  expect(latestHandler).toHaveBeenCalledWith(
    {
      ...current,
      items: current.items.map((item) =>
        item.id === 'step-0' ? { ...item, title: 'Latest step edit' } : item
      ),
    },
    'step-title:step-0'
  );
  expect(renders).not.toHaveBeenCalled();
});

it('keeps section fields quiet on metadata updates and edits the current section', async () => {
  const props = createProps();
  props.project.items.unshift({
    kind: 'section',
    id: 'section',
    title: 'Section',
    paragraphs: createGuideParagraphs('Original prose'),
  });
  await render(props);
  renders.mockClear();
  const current = { ...props.project, name: 'Latest section name' };
  const onChange = vi.fn();
  await render({ ...props, project: current, onChange });
  expect(renders).not.toHaveBeenCalled();

  await input('#section .guide-description', 'Edited prose');
  expect(onChange).toHaveBeenCalledWith(
    {
      ...current,
      items: current.items.map((item) =>
        item.id === 'section'
          ? {
              ...item,
              paragraphs: createGuideParagraphs('Edited prose'),
            }
          : item
      ),
    },
    'section-body:section'
  );
});

it('updates retained fields for locale, disabled state, numbering and block appearance', async () => {
  const props = createProps();
  await render(props);
  await render({ ...props, t: createTranslator('ru'), disabled: true });
  expect([...host.querySelectorAll('textarea')].every((field) => field.disabled)).toBe(true);
  expect(host.querySelector('#step-0 .guide-step-title')?.getAttribute('aria-label')).toBe(
    createTranslator('ru')('scenario.editor.guideStepTitle')
  );
  const items = props.project.items.map((item) =>
    item.kind === 'step' && item.id === 'step-0'
      ? {
          ...item,
          numbering: { label: 'Custom number' },
          blocks: item.blocks.map((block) =>
            block.kind === 'text'
              ? { ...block, textStyle: { size: 'large' as const, alignment: 'start' as const } }
              : block
          ),
        }
      : item
  );
  await render({ ...props, project: { ...props.project, items } });
  expect(host.querySelector('#step-0 header span')?.textContent).toBe('Custom number');
  expect(
    host.querySelector<HTMLTextAreaElement>('#step-0 .guide-description')?.style.fontSize
  ).toBe('1.25rem');
  expect([...host.querySelectorAll('textarea')].every((field) => !field.disabled)).toBe(true);
});

it('merges block edits into current siblings and rejects deleted targets and foreign-project callbacks', async () => {
  const props = createProps();
  let commands: ReturnType<typeof useGuideDocumentCommands> | undefined;
  function Probe({ value }: { value: ComponentProps<typeof GuideDocument> }) {
    commands = useGuideDocumentCommands(value);
    return null;
  }
  await act(async () => root.render(<Probe value={props} />));
  const retained = commands!;
  const original = props.project.items[0];
  if (original?.kind !== 'step') throw new Error('Missing fixture step');
  const block = original.blocks[0]!;
  if (block.kind !== 'text') throw new Error('Missing fixture text block');
  const sibling = {
    ...original.blocks[1]!,
    paragraphs: createGuideParagraphs('Latest sibling prose'),
  };
  const current = {
    ...props.project,
    name: 'Current block name',
    items: props.project.items.map((item) =>
      item.id === original.id ? { ...original, blocks: [block, sibling] } : item
    ),
  };
  const onChange = vi.fn();
  await act(async () => root.render(<Probe value={{ ...props, project: current, onChange }} />));
  expect(commands).toBe(retained);
  retained.onChangeBlock(
    original.id,
    { ...block, paragraphs: createGuideParagraphs('Edited block') },
    'block:edit'
  );
  const changed = onChange.mock.calls[0]?.[0];
  expect(changed).toEqual({
    ...current,
    items: current.items.map((item) =>
      item.id === original.id
        ? {
            ...original,
            blocks: [{ ...block, paragraphs: createGuideParagraphs('Edited block') }, sibling],
          }
        : item
    ),
  });
  onChange.mockClear();
  await act(async () =>
    root.render(<Probe value={{ ...props, project: { ...current, items: [] }, onChange }} />)
  );
  retained.onTitleChange(original.id, 'Deleted step');
  retained.onChangeBlock(original.id, block, null);
  expect(onChange).not.toHaveBeenCalled();
  await act(async () =>
    root.render(
      <Probe value={{ ...props, project: { ...current, id: 'other-project' }, onChange }} />
    )
  );
  retained.onTitleChange(original.id, 'Foreign edit');
  retained.onOperate({ kind: 'add-step' });
  expect(onChange).not.toHaveBeenCalled();
  expect(props.onOperate).not.toHaveBeenCalled();
});

it('keeps retained commands on the committed project while a newer render is suspended', async () => {
  const props = createProps();
  let commands: ReturnType<typeof useGuideDocumentCommands> | undefined;
  const pending = new Promise<void>(() => {});
  function Probe({
    value,
    suspend = false,
  }: {
    value: ComponentProps<typeof GuideDocument>;
    suspend?: boolean;
  }) {
    commands = useGuideDocumentCommands(value);
    if (suspend) throw pending;
    return <span>Committed</span>;
  }
  await act(async () =>
    root.render(
      <Suspense fallback="Pending">
        <Probe value={props} />
      </Suspense>
    )
  );
  const retained = commands!;
  const uncommitted = vi.fn();
  await act(async () =>
    startTransition(() =>
      root.render(
        <Suspense fallback="Pending">
          <Probe
            suspend
            value={{
              ...props,
              project: { ...props.project, name: 'Uncommitted name' },
              onChange: uncommitted,
            }}
          />
        </Suspense>
      )
    )
  );
  retained.onTitleChange('step-0', 'Committed edit');
  expect(uncommitted).not.toHaveBeenCalled();
  expect(props.onChange).toHaveBeenCalledWith(
    {
      ...props.project,
      items: props.project.items.map((item) =>
        item.id === 'step-0' ? { ...item, title: 'Committed edit' } : item
      ),
    },
    'step-title:step-0'
  );
  expect(host.textContent).toBe('Committed');
});
