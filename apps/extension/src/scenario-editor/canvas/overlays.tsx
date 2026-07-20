import { translate } from '../../platform/i18n';
import type {
  ScenarioMissingSlideAsset,
  ScenarioSlideRenderResult,
} from '../project/stage-render/slide';
import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import { CanvasInsertPreviewOverlay } from '@sniptale/ui/canvas-tools';
import type { ScenarioCanvasGuide } from './guides';

const GRID_LINE_COLOR = 'color-mix(in_srgb,var(--sniptale-color-border-soft)_70%,transparent)';

export function ScenarioCanvasStageOverlays(props: {
  assetLoading: boolean;
  gridSize: number;
  gridVisible: boolean;
  guides: readonly ScenarioCanvasGuide[];
  insertPreviewFrame: ScenarioElementFrame | null;
  marqueeFrame: ScenarioElementFrame | null;
  rendered: ScenarioSlideRenderResult;
}) {
  return (
    <>
      <ScenarioCanvasGridOverlay
        gridSize={props.gridSize}
        height={props.rendered.canvas.height}
        visible={props.gridVisible}
        width={props.rendered.canvas.width}
      />
      <ScenarioCanvasSafeAreaOverlay
        height={props.rendered.canvas.height}
        width={props.rendered.canvas.width}
      />
      {props.rendered.slide.elements.length === 0 ? <ScenarioCanvasEmptyState /> : null}
      <ScenarioCanvasAssetStateOverlay
        loading={props.assetLoading}
        missingAssets={props.rendered.missingAssets}
      />
      <ScenarioCanvasGuidesOverlay
        guides={props.guides}
        height={props.rendered.canvas.height}
        width={props.rendered.canvas.width}
      />
      <ScenarioCanvasMarqueeOverlay
        dataUi="scenario.canvas.insert-preview"
        frame={props.insertPreviewFrame}
      />
      <ScenarioCanvasMarqueeOverlay frame={props.marqueeFrame} />
    </>
  );
}

function ScenarioCanvasGridOverlay(props: {
  gridSize: number;
  height: number;
  visible: boolean;
  width: number;
}) {
  if (!props.visible) {
    return null;
  }

  return (
    <div
      aria-hidden
      data-ui="scenario.canvas.grid"
      className="pointer-events-none absolute inset-0 opacity-[0.28]"
      style={{
        backgroundImage: [
          `linear-gradient(to right, ${GRID_LINE_COLOR} 1px, transparent 1px)`,
          `linear-gradient(to bottom, ${GRID_LINE_COLOR} 1px, transparent 1px)`,
        ].join(','),
        backgroundSize: `${props.gridSize}px ${props.gridSize}px`,
        height: props.height,
        width: props.width,
      }}
    />
  );
}

function ScenarioCanvasSafeAreaOverlay(props: { height: number; width: number }) {
  const insetX = Math.round(props.width * 0.06);
  const insetY = Math.round(props.height * 0.075);

  return (
    <div
      aria-hidden
      data-ui="scenario.canvas.safe-area"
      className="pointer-events-none absolute rounded-[4px] border border-dashed
        border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_54%,transparent)]"
      style={{
        height: props.height - insetY * 2,
        left: insetX,
        top: insetY,
        width: props.width - insetX * 2,
      }}
    />
  );
}

function ScenarioCanvasGuidesOverlay(props: {
  guides: readonly ScenarioCanvasGuide[];
  height: number;
  width: number;
}) {
  return (
    <>
      {props.guides.map((guide) => (
        <div
          key={`${guide.axis}-${guide.position}`}
          aria-hidden
          data-ui="scenario.canvas.guide"
          className="pointer-events-none absolute z-20 bg-[var(--sniptale-color-accent)] opacity-70"
          style={getGuideStyle(guide, props)}
        />
      ))}
    </>
  );
}

function ScenarioCanvasMarqueeOverlay(props: {
  dataUi?: string;
  frame: ScenarioElementFrame | null;
}) {
  return (
    <CanvasInsertPreviewOverlay
      dataUi={props.dataUi ?? 'scenario.canvas.marquee'}
      frame={props.frame}
    />
  );
}

function ScenarioCanvasEmptyState() {
  return (
    <div
      data-ui="scenario.canvas.empty-state"
      className="pointer-events-none absolute inset-0 grid place-items-center px-10 text-center"
    >
      <div
        className="max-w-[360px] rounded-[8px] border border-dashed border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_78%,transparent)] px-5 py-4"
      >
        <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('scenario.editor.blankSlideTitle')}
        </div>
        <div className="mt-1 text-xs leading-5 text-[var(--sniptale-color-text-muted)]">
          {translate('scenario.editor.blankSlideDescription')}
        </div>
      </div>
    </div>
  );
}

function ScenarioCanvasAssetStateOverlay(props: {
  loading: boolean;
  missingAssets: readonly ScenarioMissingSlideAsset[];
}) {
  if (props.loading) {
    return <CanvasAssetBadge label={translate('scenario.editor.loadingAssets')} />;
  }
  if (props.missingAssets.length > 0) {
    return <CanvasAssetBadge label={translate('scenario.editor.missingAssets')} />;
  }

  return null;
}

function CanvasAssetBadge(props: { label: string }) {
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-30">
      <div
        data-ui="scenario.canvas.asset-state"
        className="rounded-[8px] border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]
          px-3 py-2 text-xs font-medium text-[var(--sniptale-color-text-secondary)] shadow-sm"
      >
        {props.label}
      </div>
    </div>
  );
}

function getGuideStyle(
  guide: ScenarioCanvasGuide,
  canvas: { height: number; width: number }
): React.CSSProperties {
  if (guide.axis === 'vertical') {
    return { height: canvas.height, left: guide.position, top: 0, width: 1 };
  }

  return { height: 1, left: 0, top: guide.position, width: canvas.width };
}
