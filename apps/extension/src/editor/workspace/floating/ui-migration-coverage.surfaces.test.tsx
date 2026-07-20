import type React from 'react';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import {
  createCanvasCommandGroups,
  renderFloatingToolbarCommandBody,
} from './canvas-toolbar-command-groups';
import { createLayerToolbarCommandGroups } from './layer-toolbar-groups';
import {
  CompactGridPopoverContent,
  CompactWorkspacePopoverContent,
} from './view-controls-popovers';
import type { CompactCommand } from '../../inspector/compact';
import { RoughFillContent } from '../../inspector/compact/tool-commands/line-rough-fill';
import { WORKSPACE_BACKGROUND_PALETTE } from '../../inspector/sidebar-shared';
import { EditorInspectorFramePanel } from '../../inspector/scene/panel';
import { EditorInspectorFrameModeButtons } from '../../inspector/scene/placement/modes';
import { RangeField } from '../../inspector/tools/rich-shape/fields';
import { RichShapeEffectsSection } from '../../inspector/tools/rich-shape/effects';
import { RichShapeFillSection } from '../../inspector/tools/rich-shape/fill';
import { RichShapeLineSection } from '../../inspector/tools/rich-shape/line';
import { RichShapeTextSection } from '../../inspector/tools/rich-shape/text';
import type { RichShapeControlsProps } from '../../inspector/tools/rich-shape/types';
import { CategorySection, PrimaryShortcutRow } from '../../inspector/tools/shape-browser/sections';
import { SourceFilters } from '../../inspector/tools/shape-browser/source-filters';
import type { ShapeBrowserEntry } from '../../inspector/tools/shape-browser/types';
import { ShapeBrowser } from '../../inspector/tools/shape-browser/view';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import {
  createTemplateHeaderState,
  exerciseNode,
  renderNode,
} from '../../inspector/ui-migration-coverage.test-support';

function createRangeCommand(id: string, title: string, value: number, valueLabel: string) {
  return {
    id,
    title,
    trigger: <span>{title.slice(0, 1)}</span>,
    content: <RangeField label={title} value={value} valueLabel={valueLabel} onChange={vi.fn()} />,
  };
}

function createToolbarCommands(): CompactCommand[] {
  return [
    createRangeCommand('text-font', 'Font size', 18, '18px'),
    createRangeCommand('custom-stroke-width', 'Stroke', 4, '4px'),
    createRangeCommand('shape-radius', 'Radius', 8, '8px'),
    createRangeCommand('shadow-blur', 'Shadow', 12, '12px'),
    {
      id: 'fallback-action',
      title: 'Fallback',
      trigger: <span>ACT</span>,
      active: true,
      onClick: vi.fn(),
    },
  ];
}

function createFallbackCommands(): CompactCommand[] {
  return [
    createRangeCommand('preset-custom', 'Template', 1, '1x'),
    createRangeCommand('rich-shape-fill', 'Fill', 50, '50%'),
    createRangeCommand('custom-stroke-width', 'Stroke', 4, '4px'),
    createRangeCommand('custom-stroke-opacity', 'Opacity', 80, '80%'),
    {
      id: 'custom-stroke-toggle',
      title: 'Toggle',
      trigger: <span>T</span>,
      active: false,
      onClick: vi.fn(),
    },
    createRangeCommand('rich-shape-tail', 'Tail', 2, '2x'),
    createRangeCommand('rich-shape-text', 'Text', 12, '12px'),
    createRangeCommand('rich-shape-effects', 'Effects', 12, '12px'),
  ];
}

it('renders floating toolbar groups through the compact command body contract', () => {
  const commands = createToolbarCommands();
  const fallbackCommands = createFallbackCommands();

  const fallbackLayerGroups = createLayerToolbarCommandGroups(fallbackCommands);
  const singleFallbackLayerGroups = createLayerToolbarCommandGroups([fallbackCommands[0]!]);
  const html = [
    renderNode(renderFloatingToolbarCommandBody(commands[4]!)),
    ...createCanvasCommandGroups(commands).map((group) => renderNode(group.content)),
    ...fallbackLayerGroups.map((group) => renderNode(group.content)),
    ...singleFallbackLayerGroups.map((group) => renderNode(group.content)),
  ].join('');

  expect(html).toContain('shared.ui.compact-inspector.numeric-row');
  expect(html).toContain('aria-pressed="true"');
});

function createSceneParams(): React.ComponentProps<typeof EditorInspectorFramePanel> {
  return {
    backgroundPreviewStyle: { backgroundColor: '#fff' },
    scenePresetHeader: null,
    frameDraft: DEFAULT_EDITOR_FRAME_SETTINGS,
    framePaddingSummary: '12 / 12 / 12 / 12',
    frameLayoutModeOptions: [{ label: 'Fit', value: DEFAULT_EDITOR_FRAME_SETTINGS.layoutMode }],
    frameBackgroundModeOptions: [
      { label: 'Color', value: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundMode },
    ],
    frameBackgroundPalette: ['#ffffff'],
    frameBackgroundImageFitOptions: [
      { label: 'Cover', value: DEFAULT_EDITOR_FRAME_SETTINGS.backgroundImageFit },
    ],
    gradientPresets: [{ id: 'warm', label: 'Warm', angle: 90, from: '#111111', to: '#ffffff' }],
    recentColors: [],
    toNumber: Number,
    setFrameDraft: vi.fn(),
    setLayoutMode: vi.fn(),
    setBackgroundMode: vi.fn(),
    applyGradientPreset: vi.fn(),
    previewFramePatch: vi.fn(),
    applyFramePatch: vi.fn(),
    onPickBackgroundImage: vi.fn(),
    onClearBackgroundImage: vi.fn(),
    onApplyFrame: vi.fn(),
  };
}

it('renders compact rough fill and scene panel action rows', () => {
  const baseParams = createInspectorCommandParams();
  const params = {
    ...baseParams,
    highlightedTool: 'crop',
    richShapeSelection: null,
    selection: { ...baseParams.selection, selectedObjectType: 'line' },
  } as React.ComponentProps<typeof RoughFillContent>['params'];
  const sceneParams = createSceneParams();

  const html = [
    exerciseNode(<RoughFillContent params={params} settings={params.inspectorToolSettings.line} />),
    renderNode(<EditorInspectorFramePanel {...sceneParams} />),
    renderNode(
      <EditorInspectorFramePanel {...sceneParams} scenePresetHeader={createTemplateHeaderState()} />
    ),
  ].join('');

  expect(html).toContain('shared.ui.compact-inspector.numeric-row');
  expect(html).toContain('Применить');
});

it('renders floating workspace popovers with shared color and command rows', () => {
  const params = createInspectorCommandParams();
  const documentController = {
    ...params,
    richShapeSelection: null,
    workspace: { ...params.workspace, backgroundColor: '#ffffff' },
    workspaceBackgroundPalette: WORKSPACE_BACKGROUND_PALETTE,
  } as React.ComponentProps<typeof CompactWorkspacePopoverContent>['documentController'];

  const html = [
    renderNode(<CompactWorkspacePopoverContent documentController={documentController} />),
    renderNode(<CompactGridPopoverContent documentController={documentController} />),
  ].join('');

  expect(html).toContain('shared.ui.compact-inspector.color-field');
  expect(html).toContain('shared.ui.compact-inspector.numeric-row');
});

function createRichShapeProps() {
  const shape = createDefaultRichShapeObject();
  const effectsShape = {
    ...shape,
    effects: {
      ...shape.effects,
      shadow: { ...shape.effects.shadow, enabled: true, opacity: 0.4 },
      reflection: { ...shape.effects.reflection, enabled: true, opacity: 0.35 },
    },
  };
  const richShapeProps: RichShapeControlsProps = {
    applyRichShapePatch: vi.fn(),
    arrangeSelection: vi.fn(),
    capabilities: ['fill', 'line', 'text', 'effects'],
    recentColors: ['#445566'],
    roughCapable: true,
    shape,
    shapeFillPalette: ['#112233'],
    shapeStrokePalette: ['#334455'],
    textColorPalette: ['#556677'],
    toNumber: Number,
    updateColor: vi.fn((setter: (value: string) => void, color: string) => setter(color)),
  };
  return { enabledEffectsProps: { ...richShapeProps, shape: effectsShape }, richShapeProps };
}

function createShapeBrowserEntry(): ShapeBrowserEntry {
  return {
    id: 'custom-entry',
    labelFallback: 'Custom entry',
    category: 'custom',
    source: 'custom',
    searchAliases: [],
    tags: [],
    thumbnail: null,
    insertKind: 'custom-entry',
    roughCapable: true,
  };
}

function renderFrameModeSurface() {
  return renderNode(
    <EditorInspectorFrameModeButtons
      options={[
        { label: 'Fit', value: 'fit' },
        { label: 'Fill', value: 'fill' },
      ]}
      value="fit"
      onChange={vi.fn()}
    />
  );
}

function renderRichShapeControlSurfaces(
  richShapeProps: RichShapeControlsProps,
  enabledEffectsProps: RichShapeControlsProps
) {
  return [
    exerciseNode(<RichShapeEffectsSection {...richShapeProps} />),
    exerciseNode(<RichShapeEffectsSection {...enabledEffectsProps} />),
    renderNode(<RichShapeFillSection {...richShapeProps} roughCapable={false} />),
    exerciseNode(<RichShapeLineSection compact {...richShapeProps} />),
    exerciseNode(<RichShapeTextSection compact {...richShapeProps} />),
    exerciseNode(<RichShapeTextSection {...richShapeProps} />),
  ];
}

function renderPrimaryShapeBrowserSurfaces(entry: ShapeBrowserEntry) {
  return [
    renderNode(
      <PrimaryShortcutRow entries={[entry]} selectedEntryId={entry.id} onSelect={vi.fn()} />
    ),
    renderNode(
      <CategorySection
        group={{ category: 'custom', entries: [entry] }}
        expanded={false}
        onSelect={vi.fn()}
        onToggleExpanded={vi.fn()}
      />
    ),
    renderNode(<SourceFilters value="all" onChange={vi.fn()} />),
    renderNode(
      <ShapeBrowser additionalEntries={[entry]} defaultSourceFilter="custom" onSelect={vi.fn()} />
    ),
  ];
}

function renderEmptyImportShapeBrowserSurface() {
  return renderNode(
    <ShapeBrowser
      additionalEntries={[]}
      defaultSourceFilter="imported-library"
      excludedCategories={[
        'action-buttons',
        'basic-shapes',
        'block-arrows',
        'callouts',
        'custom',
        'equation-shapes',
        'flowchart',
        'imported',
        'lines-connectors',
        'primary-shortcuts',
        'stars-banners',
      ]}
      importState={{ status: 'empty' }}
      showImport={false}
      showPrimaryShortcuts={false}
      showSourceFilters={false}
      onSelect={vi.fn()}
    />
  );
}

it('renders rich-shape, frame mode, and shape browser surfaces with compact controls', () => {
  const { enabledEffectsProps, richShapeProps } = createRichShapeProps();
  const entry = createShapeBrowserEntry();
  const html = [
    renderFrameModeSurface(),
    ...renderRichShapeControlSurfaces(richShapeProps, enabledEffectsProps),
    ...renderPrimaryShapeBrowserSurfaces(entry),
    renderEmptyImportShapeBrowserSurface(),
  ].join('');

  expect(html).toContain('shared.ui.compact-inspector.numeric-row');
  expect(html).toContain('data-shape-browser-tile="true"');
  expect(html).toContain('data-shape-source-filter="all"');
});
