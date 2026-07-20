import { FileText, Layers3 } from 'lucide-react';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import {
  getScenarioSlideBuildStepSummaries,
  renderScenarioSlide,
} from '../../project/stage-render/slide';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../../platform/i18n';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { ScenarioCanvasSvgAdapter } from '../../canvas';
import { ScenarioSlideTransitionBadges } from '../slide-transition-badges';
import { useScenarioPresentationKeyboard } from './keyboard';

export function ScenarioOverviewSurface(props: {
  assets?: ScenarioSlideRenderAssetMap;
  onExit: () => void;
  onSelectSlide: (slideId: string) => void;
  selectedSlideId: string;
  slides: ScenarioSlide[];
}) {
  useScenarioPresentationKeyboard({ onExit: props.onExit });

  return (
    <main
      data-ui="scenario.editor.v3.overview"
      className="h-full min-h-0 overflow-auto bg-[var(--sniptale-color-surface-canvas)] p-5"
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3">
        {props.slides.map((slide, index) => (
          <ScenarioOverviewTile
            key={slide.id}
            {...(props.assets ? { assets: props.assets } : {})}
            index={index}
            selected={slide.id === props.selectedSlideId}
            slide={slide}
            onSelect={() => props.onSelectSlide(slide.id)}
          />
        ))}
      </div>
    </main>
  );
}

function ScenarioOverviewTile(props: {
  assets?: ScenarioSlideRenderAssetMap;
  index: number;
  onSelect: () => void;
  selected: boolean;
  slide: ScenarioSlide;
}) {
  const rendered = renderScenarioSlide(props.slide, {
    ...(props.assets ? { assets: props.assets } : {}),
    clickIndex: props.slide.clicks.initialIndex,
    mode: 'thumbnail',
    outputWidth: 260,
  });

  return (
    <button
      type="button"
      data-active={props.selected ? 'true' : 'false'}
      onClick={props.onSelect}
      className="grid gap-2 rounded-[8px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] p-2 text-left transition
        hover:border-[var(--sniptale-color-accent)] data-[active=true]:border-[var(--sniptale-color-accent)]
        data-[active=true]:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_16%,transparent)]"
    >
      <div
        className="relative overflow-hidden rounded-[6px] border border-[var(--sniptale-color-border-soft)]"
        style={{ height: rendered.canvas.height, width: rendered.canvas.width }}
      >
        <ScenarioCanvasSvgAdapter svg={rendered.svg} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {props.index + 1}. {props.slide.title || translate('scenario.editor.untitledSlide')}
        </div>
        <p className="line-clamp-2 text-xs text-[var(--sniptale-color-text-secondary)]">
          {props.slide.notes || props.slide.guide?.body}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <OverviewTileIndicators slide={props.slide} />
      </div>
    </button>
  );
}

function OverviewTileIndicators(props: { slide: ScenarioSlide }) {
  const buildSteps = getScenarioSlideBuildStepSummaries(props.slide);
  const buildStepCount = buildSteps.filter((step) => step.enteringElementIds.length > 0).length;
  return (
    <>
      <ValueBadge className="gap-1">
        <Layers3 className="h-3 w-3" /> {buildStepCount}/{props.slide.clicks.count}
      </ValueBadge>
      <ScenarioSlideTransitionBadges slide={props.slide} />
      {props.slide.notes ? (
        <ValueBadge className="gap-1">
          <FileText className="h-3 w-3" /> {translate('scenario.editor.notes')}
        </ValueBadge>
      ) : null}
    </>
  );
}
