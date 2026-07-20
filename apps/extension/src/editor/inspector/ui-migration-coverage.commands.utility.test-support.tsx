import { vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../features/editor/document/constants';
import { createInspectorCommandParams } from '../../../../../tooling/test/harness/editor/ownership/fixtures';
import { EditorDocumentExportPreferencesQualitySection } from './document-actions/disclosures/quality';
import { EditorInspectorGridSizeSection } from './grid/sections/shared/size-section';
import { getLayerRowClassName } from './layers/shared';
import { EditorInspectorPresetHeader } from './presets';
import { EditorInspectorFrameSourceImageSection } from './scene/source-image';
import {
  createTemplateHeaderState,
  exerciseNode,
  renderNode,
} from './ui-migration-coverage.test-support';
import type { EditorInspectorPresetHeaderState } from './presets';

function createExportQualityNodes() {
  const settings = {
    commitImageQuality: vi.fn(),
    imageFormat: 'jpeg',
    imageQuality: 82,
    setImageQuality: vi.fn(),
  };
  const pngSettings = { ...settings, imageFormat: 'png' };

  return [
    exerciseNode(EditorDocumentExportPreferencesQualitySection({ settings: settings as never })),
    renderNode(EditorDocumentExportPreferencesQualitySection({ settings: pngSettings as never })),
  ];
}

function createGridAndSourceNodes() {
  const params = createInspectorCommandParams();
  const gridNode = EditorInspectorGridSizeSection({
    clampGridSize: (value) => Math.max(4, Math.min(64, value)),
    gridSize: 16,
    gridSizeMax: 64,
    gridSizeMin: 4,
    updateWorkspace: params.updateWorkspace,
  });
  const sourceImageNode = EditorInspectorFrameSourceImageSection({
    applyFramePatch: vi.fn(),
    frameDraft: DEFAULT_EDITOR_FRAME_SETTINGS,
    recentColors: [],
    shapeStrokePalette: ['#112233'],
  });

  return [exerciseNode(gridNode), exerciseNode(sourceImageNode)];
}

function createFallbackTemplate(id: string, system: boolean) {
  return {
    id,
    label: system ? 'Fallback system' : 'Fallback user',
    onApply: vi.fn(),
    preview: <span>fallback</span>,
    selected: false,
    ...(system ? { system } : {}),
  };
}

function createFallbackHeaderState() {
  return {
    activeView: 'templates' as const,
    groups: [],
    onOpenSavePanel: vi.fn(),
    onViewChange: vi.fn(),
    saveDisabled: false,
    savePanel: null,
    templates: [
      createFallbackTemplate('fallback-system', true),
      createFallbackTemplate('fallback-user', false),
    ],
  } satisfies EditorInspectorPresetHeaderState;
}

function renderPresetHeader(state: EditorInspectorPresetHeaderState) {
  return renderNode(
    <EditorInspectorPresetHeader state={state}>
      <span>Parameters</span>
    </EditorInspectorPresetHeader>
  );
}

function createPresetHeaderNodes() {
  return [
    renderPresetHeader(createTemplateHeaderState()),
    renderPresetHeader({ ...createTemplateHeaderState(), activeView: 'parameters' }),
    renderPresetHeader(createFallbackHeaderState()),
  ];
}

function createLayerClassName() {
  return getLayerRowClassName({ id: 'layer-1', selected: true } as never, 'layer-1', false);
}

export function createUtilityCoverage() {
  return {
    html: [
      ...createExportQualityNodes(),
      ...createGridAndSourceNodes(),
      ...createPresetHeaderNodes(),
    ].join(''),
    layerClassName: createLayerClassName(),
  };
}
