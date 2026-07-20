// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { CompactCommand } from '../../inspector/compact';
import type { EditorToolbarSelectionState } from '../toolbar/types';
import { buildCanvasSelectionToolbarGroups } from './canvas-toolbar-groups';
import { command } from './canvas-toolbar-groups.test-support';
import type { EditorFloatingDocumentController } from './document-bar';

function createDocumentController(
  overrides: Partial<EditorFloatingDocumentController> = {}
): EditorFloatingDocumentController {
  return {
    arrangeSelection: vi.fn(),
    canDeleteSelection: true,
    DimensionInput: ({
      label,
      onChange,
    }: {
      label: string;
      onChange?: (value: number) => void;
    }) => (
      <button type="button" aria-label={label} onClick={() => onChange?.(222)}>
        {label}
      </button>
    ),
    isResizableLayerSelection: false,
    layerAspectRatio: null,
    layerSizeDraft: { height: 120, width: 160 },
    layerSizeLocked: true,
    onOpenLayerEffects: vi.fn(),
    onResizeLayer: vi.fn(),
    setLayerSizeDraft: vi.fn(),
    updateLockedDraft: vi.fn((state) => state),
    ...overrides,
  } as unknown as EditorFloatingDocumentController;
}

function createSelection(
  overrides: Partial<EditorToolbarSelectionState> = {}
): EditorToolbarSelectionState {
  return {
    hasSelection: true,
    selectedObjectCount: 1,
    selectedObjectId: 'layer-1',
    selectedObjectType: 'rectangle',
    ...overrides,
  };
}

function buildGroups(args: {
  commands: CompactCommand[];
  documentController?: Partial<EditorFloatingDocumentController>;
  selection?: Partial<EditorToolbarSelectionState>;
}) {
  return buildCanvasSelectionToolbarGroups({
    commands: args.commands,
    documentController: createDocumentController(args.documentController),
    handlers: {
      arrangeSelection: vi.fn(),
      deleteSelection: vi.fn(),
      duplicateSelection: vi.fn(),
      openLayerEffects: vi.fn(),
      toggleLayerLock: vi.fn(),
    },
    selection: createSelection(args.selection),
  });
}

function createActionToolbarHarness() {
  const arrangeSelection = vi.fn();
  const deleteSelection = vi.fn();
  const duplicateSelection = vi.fn();
  const openLayerEffects = vi.fn();
  const groups = buildCanvasSelectionToolbarGroups({
    commands: [],
    documentController: createDocumentController({ arrangeSelection }),
    handlers: {
      arrangeSelection,
      deleteSelection,
      duplicateSelection,
      openLayerEffects,
      toggleLayerLock: vi.fn(),
    },
    selection: createSelection(),
  });

  return { arrangeSelection, deleteSelection, duplicateSelection, groups, openLayerEffects };
}

function renderActionToolbarMarkup(
  groups: ReturnType<typeof createActionToolbarHarness>['groups']
) {
  return {
    effectsButtons: renderToStaticMarkup(
      <>{groups.find((group) => group.kind === 'effects')?.content}</>
    ),
    moreButtons: renderToStaticMarkup(<>{groups.find((group) => group.id === 'more')?.content}</>),
  };
}

function clickRenderedActionToolbar(
  groups: ReturnType<typeof createActionToolbarHarness>['groups']
) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(
      <>
        {groups.find((group) => group.id === 'more')?.content}
        {groups.find((group) => group.kind === 'effects')?.content}
      </>
    );
  });
  act(() => {
    const buttons = Array.from(container.querySelectorAll('button'));
    buttons[0]?.click();
    buttons[1]?.click();
    buttons[2]?.click();
    buttons.at(-3)?.click();
    buttons.at(-2)?.click();
    buttons.at(-1)?.click();
  });
  act(() => root.unmount());
}

it('keeps template first and stable relative group order for shape commands', () => {
  const groups = buildGroups({
    commands: [
      command('shape-stroke-width'),
      command('shape-fill-color'),
      command('shape-shadow'),
      command('shape-preset'),
      command('shape-radius'),
    ],
  });

  expect(groups.map((group) => group.kind).join()).toBe(
    'templates,fill,stroke,geometry,effects,more,more'
  );
  expect(
    renderToStaticMarkup(<>{groups.find((group) => group.kind === 'fill')?.content}</>)
  ).toContain('shape-fill-color');
});

it('keeps text content, fill and layout in the shared composition', () => {
  const groups = buildGroups({
    commands: [
      command('text-align'),
      command('text-background'),
      command('text-font'),
      command('text-font-size'),
      command('text-color'),
    ],
    selection: { selectedObjectType: 'text' },
  });

  expect(groups.map((group) => group.kind).join()).toBe(
    'content,geometry,stroke,fill,geometry,more,more'
  );
  expect(groups.map((group) => group.id)).toEqual([
    'font',
    'font-size',
    'text-color',
    'fill',
    'geometry',
    'layer-lock',
    'more',
  ]);
});

it('uses the specialized blur grouping and keeps only More as the layer-only addition', () => {
  const groups = buildGroups({
    commands: [
      command('blur-template'),
      command('blur-type'),
      command('blur-amount'),
      command('blur-radius'),
      command('blur-stroke-width'),
      command('blur-stroke-style'),
      command('blur-stroke-color'),
      command('blur-stroke-opacity'),
    ],
    selection: { selectedObjectType: 'blur' },
  });

  expect(groups.map((group) => group.id)).toEqual([
    'templates',
    'effect',
    'border',
    'layer-lock',
    'more',
  ]);
  expect(groups.map((group) => group.kind)).toEqual([
    'templates',
    'content',
    'stroke',
    'more',
    'more',
  ]);
  expect(
    renderToStaticMarkup(<>{groups.find((group) => group.id === 'effect')?.content}</>)
  ).toContain('blur-amount');
  expect(
    renderToStaticMarkup(<>{groups.find((group) => group.id === 'border')?.content}</>)
  ).toContain('blur-stroke-color');
});

it('adds geometry for selected inserted image layers', () => {
  const onResizeLayer = vi.fn();
  const setLayerSizeDraft = vi.fn();
  const groups = buildGroups({
    commands: [],
    documentController: {
      isResizableLayerSelection: true,
      onResizeLayer,
      setLayerSizeDraft,
    } as any,
    selection: { selectedObjectType: 'image' },
  });
  const geometry = groups.find((group) => group.kind === 'geometry');
  renderToStaticMarkup(<>{geometry?.content}</>);

  expect(groups.map((group) => group.kind)).toEqual(['geometry', 'effects', 'more', 'more']);
  expect(setLayerSizeDraft).not.toHaveBeenCalled();
});

it('lets inserted image geometry controls update draft dimensions and apply resize', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onResizeLayer = vi.fn();
  const setLayerSizeDraft = vi.fn();
  const groups = buildGroups({
    commands: [],
    documentController: {
      isResizableLayerSelection: true,
      onResizeLayer,
      setLayerSizeDraft,
    } as any,
    selection: { selectedObjectType: 'image' },
  });

  act(() => {
    root.render(<>{groups.find((group) => group.kind === 'geometry')?.content}</>);
  });
  act(() => {
    const buttons = Array.from(container.querySelectorAll('button'));
    buttons[0]?.click();
    buttons.at(-1)?.click();
  });

  expect(setLayerSizeDraft).toHaveBeenCalled();
  expect(onResizeLayer).toHaveBeenCalledWith('layer-1', 160, 120);
  act(() => root.unmount());
});

it('moves duplicate delete and arrange into More and disables them for source image', () => {
  const groups = buildGroups({
    commands: [],
    selection: { selectedObjectType: 'source-image' },
  });
  const more = groups.find((group) => group.id === 'more');

  const markup = renderToStaticMarkup(<>{more?.content}</>);

  expect(markup.match(/disabled=""/g)).toHaveLength(6);
});

it('routes More and Effects menu actions through existing selection handlers', () => {
  const harness = createActionToolbarHarness();
  const { effectsButtons, moreButtons } = renderActionToolbarMarkup(harness.groups);

  expect(moreButtons).toContain('lucide-copy');
  expect(moreButtons).toContain('На слой выше');
  expect(moreButtons).toContain('На слой ниже');
  expect(moreButtons).toContain('Цветокоррекция');
  expect(moreButtons).toContain('Трансформации');
  expect(moreButtons).toContain('Фильтры');
  expect(effectsButtons).toContain('Цветокоррекция');

  clickRenderedActionToolbar(harness.groups);

  expect(harness.duplicateSelection).toHaveBeenCalledOnce();
  expect(harness.deleteSelection).toHaveBeenCalledOnce();
  expect(harness.arrangeSelection).toHaveBeenCalledWith('forward');
  expect(harness.openLayerEffects).toHaveBeenCalledWith('layer-1', 'adjustments', 'brightness');
  expect(harness.openLayerEffects).toHaveBeenCalledWith('layer-1', 'transformations', null);
  expect(harness.openLayerEffects).toHaveBeenCalledWith('layer-1', 'filters', 'blur');
});

it('maps pencil dynamic width to geometry instead of stroke', () => {
  const groups = buildGroups({
    commands: [command('pencil-color'), command('pencil-width'), command('pencil-dynamic-width')],
  });

  expect(groups.map((group) => group.id)).toEqual(['geometry', 'line-color', 'layer-lock', 'more']);
});
