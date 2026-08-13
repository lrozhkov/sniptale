import { AppWindow, Crop, Info, Layers3, Minimize2, Scaling, Wallpaper } from 'lucide-react';
import type { ReactNode } from 'react';
import { translate } from '../../../platform/i18n';
import type { EditorInspector } from '../../state/types';
import { EditorIconButton, cx } from '../../chrome/ui';
import { LayerInsertImageControl } from '../../inspector/layers/file-input';

export type EditorLayersPanelMode =
  | 'layers'
  | 'frame'
  | 'browser-frame'
  | 'meta'
  | 'image-size'
  | 'canvas-size';

const MODE_BY_INSPECTOR: Partial<Record<EditorInspector, EditorLayersPanelMode>> = {
  frame: 'frame',
  'browser-frame': 'browser-frame',
  meta: 'meta',
  'image-size': 'image-size',
  'canvas-size': 'canvas-size',
};

export function resolveEditorLayersPanelMode(inspector: EditorInspector): EditorLayersPanelMode {
  return MODE_BY_INSPECTOR[inspector] ?? 'layers';
}

const modes: ReadonlyArray<{
  icon: ReactNode;
  id: EditorLayersPanelMode;
  label: () => string;
}> = [
  {
    id: 'layers',
    icon: <Layers3 size={16} strokeWidth={2} />,
    label: () => translate('editor.toolbar.layersTitle'),
  },
  {
    id: 'frame',
    icon: <Wallpaper size={16} strokeWidth={2} />,
    label: () => translate('editor.toolbar.frame'),
  },
  {
    id: 'browser-frame',
    icon: <AppWindow size={16} strokeWidth={2} />,
    label: () => translate('editor.toolbar.browserFrame'),
  },
  {
    id: 'meta',
    icon: <Info size={16} strokeWidth={2} />,
    label: () => translate('editor.toolbar.meta'),
  },
  {
    id: 'image-size',
    icon: <Scaling size={16} strokeWidth={2} />,
    label: () => translate('editor.toolbar.imageSize'),
  },
  {
    id: 'canvas-size',
    icon: <Crop size={16} strokeWidth={2} />,
    label: () => translate('editor.toolbar.canvasSize'),
  },
];

const [layersMode, ...settingsModes] = modes;

function renderModeButton(
  mode: (typeof modes)[number],
  props: Pick<Parameters<typeof EditorFloatingLayersNavigation>[0], 'activeMode' | 'onSelectMode'>
) {
  return (
    <EditorIconButton
      key={mode.id}
      title={mode.label()}
      aria-pressed={props.activeMode === mode.id}
      active={props.activeMode === mode.id}
      className="h-8 w-8 shrink-0"
      data-ui={`editor.floating.layers.mode.${mode.id}`}
      onClick={() => props.onSelectMode(mode.id)}
    >
      {mode.icon}
    </EditorIconButton>
  );
}

export function EditorFloatingLayersNavigation(props: {
  activeMode: EditorLayersPanelMode;
  collapsed?: boolean;
  onCollapse?: () => void;
  onSelectMode: (mode: EditorLayersPanelMode) => void;
}) {
  return (
    <div
      aria-label={translate('editor.toolbar.layersTitle')}
      role="toolbar"
      className={cx(
        'pointer-events-auto flex shrink-0 items-center gap-1 border-b p-2',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
        props.collapsed && 'flex-row rounded-[14px] border bg-[var(--sniptale-color-surface-panel)]'
      )}
    >
      {layersMode ? renderModeButton(layersMode, props) : null}
      <LayerInsertImageControl />
      {settingsModes.map((mode) => renderModeButton(mode, props))}
      <span aria-hidden="true" className={props.collapsed ? 'h-5 w-px' : 'ml-auto'} />
      {props.collapsed || !props.onCollapse ? null : (
        <EditorIconButton
          title={translate('editor.toolbar.collapseLayers')}
          className="ml-1 h-8 w-8 shrink-0"
          data-ui="editor.floating.layers.collapse-button"
          onClick={props.onCollapse}
        >
          <Minimize2 size={16} strokeWidth={2} />
        </EditorIconButton>
      )}
    </div>
  );
}
