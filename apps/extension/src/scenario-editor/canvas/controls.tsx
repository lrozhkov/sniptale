import { Crosshair, Grid2X2, Magnet, Map, Minus, Plus, Scan } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { EditorIconButton, EditorToolbarSection } from '@sniptale/ui/editor-chrome';
import type { ScenarioCanvasViewportControls, ScenarioCanvasZoomMode } from './viewport-state';

function ScenarioCanvasControls(props: ScenarioCanvasViewportControls) {
  return (
    <EditorToolbarSection dataUi="scenario.canvas.controls" className="gap-1 px-0 sm:px-0">
      <ScenarioCanvasZoomControls {...props} />
      <ScenarioCanvasAlignmentControls {...props} />
    </EditorToolbarSection>
  );
}

export function ScenarioCanvasFloatingControls(props: ScenarioCanvasViewportControls) {
  return (
    <div
      data-ui="scenario.canvas.floating-controls"
      className="absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center rounded-[8px]
        border border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)] px-2 py-1.5
        shadow-[0_12px_32px_rgba(15,23,42,0.12)]"
    >
      <ScenarioCanvasControls {...props} />
    </div>
  );
}

export function ScenarioCanvasZoomControls(props: {
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOne: () => void;
  onZoomOut: () => void;
  scale: number;
  zoomMode: ScenarioCanvasZoomMode;
}) {
  return (
    <div data-ui="scenario.canvas.zoom-controls" className="flex shrink-0 items-center gap-1">
      <EditorIconButton title={translate('scenario.editor.zoomOut')} onClick={props.onZoomOut}>
        <Minus className="h-4 w-4" />
      </EditorIconButton>
      <ScenarioCanvasZoomToggle {...props} />
      <EditorIconButton title={translate('scenario.editor.zoomIn')} onClick={props.onZoomIn}>
        <Plus className="h-4 w-4" />
      </EditorIconButton>
    </div>
  );
}

function ScenarioCanvasZoomToggle(props: {
  onFit: () => void;
  onZoomOne: () => void;
  scale: number;
  zoomMode: ScenarioCanvasZoomMode;
}) {
  const zoomPercent = Math.round(props.scale * 100);
  const shouldFit = props.zoomMode !== 'fit' && zoomPercent === 100;
  const title = shouldFit
    ? translate('scenario.editor.fitToView')
    : translate('scenario.editor.zoomToActualSize');

  return (
    <button
      type="button"
      aria-label={`${title} · ${translate('scenario.editor.zoomCurrentPrefix')} ${zoomPercent}%`}
      data-active={props.zoomMode === 'fit'}
      title={`${title} · ${translate('scenario.editor.zoomCurrentPrefix')} ${zoomPercent}%`}
      onClick={shouldFit ? props.onFit : props.onZoomOne}
      className="inline-flex h-9 min-w-14 items-center justify-center rounded-[8px] px-2 text-xs
        font-semibold text-[var(--sniptale-color-text-secondary)] transition
        data-[active=true]:text-[var(--sniptale-color-text-primary)]
        hover:text-[var(--sniptale-color-text-primary)]"
    >
      {zoomPercent}%
    </button>
  );
}

function ScenarioCanvasAlignmentControls(props: {
  gridVisible: boolean;
  magnetEnabled: boolean;
  navigatorVisible?: boolean;
  onSetNavigatorVisible?: (visible: boolean) => void;
  onSetMagnetEnabled: (enabled: boolean) => void;
  onSetGridVisible: (visible: boolean) => void;
  onSetSnapToGrid: (enabled: boolean) => void;
  snapToGrid: boolean;
}) {
  return (
    <div data-ui="scenario.canvas.alignment-controls" className="flex shrink-0 items-center gap-1">
      <EditorIconButton
        active={props.gridVisible}
        title={translate('scenario.editor.toggleGrid')}
        onClick={() => props.onSetGridVisible(!props.gridVisible)}
      >
        <Grid2X2 className="h-4 w-4" />
      </EditorIconButton>
      <EditorIconButton
        active={props.magnetEnabled}
        title={translate('scenario.editor.toggleMagnet')}
        onClick={() => props.onSetMagnetEnabled(!props.magnetEnabled)}
      >
        <Magnet className="h-4 w-4" />
      </EditorIconButton>
      <EditorIconButton
        active={props.snapToGrid}
        title={translate('scenario.editor.toggleSnapToGrid')}
        onClick={() => props.onSetSnapToGrid(!props.snapToGrid)}
      >
        <Crosshair className="h-4 w-4" />
      </EditorIconButton>
      <EditorIconButton
        active={props.navigatorVisible ?? false}
        title={translate('scenario.editor.toggleNavigator')}
        onClick={() => props.onSetNavigatorVisible?.(!(props.navigatorVisible ?? false))}
      >
        <Map className="h-4 w-4" />
      </EditorIconButton>
      <EditorIconButton title={translate('scenario.editor.safeArea')} disabled>
        <Scan className="h-4 w-4" />
      </EditorIconButton>
    </div>
  );
}
