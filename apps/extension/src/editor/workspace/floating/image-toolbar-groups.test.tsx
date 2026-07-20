// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CompactCommandField, type CompactCommand } from '../../inspector/compact';
import { buildCanvasSelectionToolbarGroups } from './canvas-toolbar-groups';
import { createImageToolbarGroups, isImageToolbarCommandSet } from './image-toolbar-groups';
import { createLayerToolbarCommandGroups } from './layer-toolbar-groups';

function imageCommand(id: string, value?: string): CompactCommand {
  return {
    id,
    title: id,
    trigger: <span>{id}</span>,
    ...(value === undefined ? {} : { value }),
    content: (
      <CompactCommandField label={id} value={value ?? id}>
        <div>body-{id}</div>
      </CompactCommandField>
    ),
  };
}

const IMAGE_COMMANDS = [
  imageCommand('image-opacity', '50%'),
  imageCommand('image-radius', '12px'),
  imageCommand('image-shadow'),
  imageCommand('image-stroke-width', '4px'),
  imageCommand('image-stroke-style', 'dashed'),
  imageCommand('image-stroke-color', '#123456'),
  imageCommand('image-stroke-opacity', '70%'),
];

it('groups image layer controls as direct opacity, radius, shadow, border, and more commands', () => {
  const groups = createImageToolbarGroups(IMAGE_COMMANDS);

  expect(isImageToolbarCommandSet(IMAGE_COMMANDS)).toBe(true);
  expect(createImageToolbarGroups([imageCommand('shape-stroke-width')])).toBeNull();
  expect(groups?.map((group) => group.id)).toEqual(['opacity', 'geometry', 'shadow', 'border']);
  expect(groups?.map((group) => group.kind)).toEqual(['content', 'geometry', 'effects', 'stroke']);
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'border')?.trigger}</>)
  ).toContain('aria-hidden');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'opacity')?.content}</>)
  ).not.toContain('50%');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'geometry')?.content}</>)
  ).toContain('image-radius');
});

it('keeps image layer toolbar specialized and skips legacy image geometry/effects groups', () => {
  const groups = buildCanvasSelectionToolbarGroups({
    commands: IMAGE_COMMANDS,
    documentController: {
      arrangeSelection: vi.fn(),
      canDeleteSelection: true,
    } as never,
    handlers: {
      arrangeSelection: vi.fn(),
      deleteSelection: vi.fn(),
      duplicateSelection: vi.fn(),
      openLayerEffects: vi.fn(),
      toggleLayerLock: vi.fn(),
    },
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'image-1',
      selectedObjectType: 'image',
    },
  });

  expect(groups.map((group) => group.id)).toEqual([
    'opacity',
    'geometry',
    'shadow',
    'border',
    'layer-lock',
    'more',
  ]);
  expect(groups.filter((group) => group.id === 'effects')).toHaveLength(0);
});

it('keeps legacy image geometry for non-image command sets and groups generic layer commands', () => {
  const genericGroups = createLayerToolbarCommandGroups([
    imageCommand('shape-fill-color'),
    imageCommand('shape-stroke-width'),
    imageCommand('shape-radius'),
    imageCommand('shape-shadow'),
  ]);
  const canvasGroups = buildCanvasSelectionToolbarGroups({
    commands: [imageCommand('shape-radius')],
    documentController: {
      arrangeSelection: vi.fn(),
      canDeleteSelection: true,
      isResizableLayerSelection: true,
      layerAspectRatio: 1,
      layerSizeDraft: { width: 160, height: 120 },
      layerSizeLocked: false,
      onResizeLayer: vi.fn(),
      setLayerSizeDraft: vi.fn(),
      updateLockedDraft: vi.fn(),
      DimensionInput: () => null,
    } as never,
    handlers: {
      arrangeSelection: vi.fn(),
      deleteSelection: vi.fn(),
      duplicateSelection: vi.fn(),
      openLayerEffects: vi.fn(),
      toggleLayerLock: vi.fn(),
    },
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'image-1',
      selectedObjectType: 'image',
    },
  });

  expect(genericGroups.map((group) => group.kind)).toEqual([
    'fill',
    'stroke',
    'geometry',
    'effects',
  ]);
  expect(canvasGroups.some((group) => group.id === 'geometry')).toBe(true);
  expect(canvasGroups.some((group) => group.id === 'layer-lock')).toBe(true);
});

it('falls back image border trigger metrics when optional border commands are missing', () => {
  const groups = createImageToolbarGroups([imageCommand('image-stroke-color', '#123456')]);

  expect(groups?.map((group) => group.id)).toEqual(['border']);
  expect(renderToStaticMarkup(<>{groups?.[0]?.trigger}</>)).toContain('aria-hidden');
});
