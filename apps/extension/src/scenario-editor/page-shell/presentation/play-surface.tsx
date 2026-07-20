import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getScenarioSlideBuildStepSummary,
  renderScenarioSlide,
} from '../../project/stage-render/slide';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../../platform/i18n';
import { EditorIconButton, ValueBadge } from '@sniptale/ui/editor-chrome';
import { useScenarioPresentationKeyboard } from './keyboard';
import { ScenarioPresentationSlideFrame } from './transition';
import { ScenarioPresentationZoomSurface } from './zoom-surface';

export function ScenarioDeckPlaySurface(props: {
  assets?: ScenarioSlideRenderAssetMap;
  clickIndex: number;
  onExit: () => void;
  onNext: () => void;
  onPrevious: () => void;
  slide: ScenarioSlide;
  slideIndex: number;
  slideTotal: number;
}) {
  useScenarioPresentationKeyboard({
    onExit: props.onExit,
    onNext: props.onNext,
    onPrevious: props.onPrevious,
  });
  const rendered = renderScenarioSlide(props.slide, {
    ...(props.assets ? { assets: props.assets } : {}),
    clickIndex: props.clickIndex,
    mode: 'export',
    outputWidth: 1080,
  });

  return (
    <main
      data-ui="scenario.editor.v3.play"
      className="relative h-full min-h-0 overflow-hidden bg-[var(--sniptale-color-surface-canvas)]"
    >
      <ScenarioPresentationZoomSurface rendered={rendered}>
        {(zoomedRendered) => (
          <ScenarioPresentationSlideFrame clickIndex={props.clickIndex} rendered={zoomedRendered} />
        )}
      </ScenarioPresentationZoomSurface>
      <ScenarioDeckPlayNavigation {...props} />
    </main>
  );
}

function ScenarioDeckPlayNavigation(props: {
  clickIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  slide: ScenarioSlide;
  slideIndex: number;
  slideTotal: number;
}) {
  const build = getScenarioSlideBuildStepSummary(props.slide, props.clickIndex);

  return (
    <div
      className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-[8px]
        border border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)] px-2 py-1
        shadow-[0_12px_32px_rgba(15,23,42,0.14)]"
    >
      <EditorIconButton title={translate('scenario.editor.previous')} onClick={props.onPrevious}>
        <ChevronLeft className="h-4 w-4" />
      </EditorIconButton>
      <ValueBadge>
        {props.slideIndex + 1}/{props.slideTotal} · {props.clickIndex}/{props.slide.clicks.count}
      </ValueBadge>
      <ValueBadge title={translate('scenario.editor.visibleElements')}>
        {build.visibleElementIds.length}/{props.slide.elements.length}
      </ValueBadge>
      <EditorIconButton title={translate('scenario.editor.next')} onClick={props.onNext}>
        <ChevronRight className="h-4 w-4" />
      </EditorIconButton>
    </div>
  );
}
