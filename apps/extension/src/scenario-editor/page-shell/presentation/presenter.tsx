import { ChevronLeft, ChevronRight, Clock, LogOut, MonitorPlay } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getScenarioSlideBuildStepSummary,
  renderScenarioSlide,
} from '../../project/stage-render/slide';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { translate } from '../../../platform/i18n';
import { EditorIconButton, ValueBadge } from '@sniptale/ui/editor-chrome';
import { ScenarioCanvasSvgAdapter } from '../../canvas';
import { useScenarioPresentationKeyboard } from './keyboard';
import { ScenarioPresentationSlideFrame } from './transition';
import { ScenarioPresentationZoomSurface } from './zoom-surface';

interface ScenarioPresenterSurfaceProps {
  assets?: ScenarioSlideRenderAssetMap;
  audienceOpening: boolean;
  clickIndex: number;
  elapsedSeconds: number;
  nextSlide: ScenarioSlide | null;
  onExit: () => void;
  onNext: () => void;
  onOpenAudienceScreen: () => void;
  onPrevious: () => void;
  slide: ScenarioSlide;
  slideIndex: number;
  slideTotal: number;
}

export function ScenarioPresenterSurface(props: ScenarioPresenterSurfaceProps) {
  useScenarioPresentationKeyboard({
    onExit: props.onExit,
    onNext: props.onNext,
    onPrevious: props.onPrevious,
  });
  const currentTime = useCurrentPresenterTime();
  return (
    <main
      data-ui="scenario.editor.v3.presenter"
      className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-3 overflow-hidden
        bg-[var(--sniptale-color-surface-canvas)] p-3"
    >
      <PresenterCurrentSlide
        {...(props.assets ? { assets: props.assets } : {})}
        clickIndex={props.clickIndex}
        slide={props.slide}
      />
      <aside className="grid min-h-0 grid-rows-[auto_auto_auto_1fr] gap-3">
        <PresenterStatus
          clickIndex={props.clickIndex}
          currentTime={currentTime}
          elapsedSeconds={props.elapsedSeconds}
          slide={props.slide}
          slideIndex={props.slideIndex}
          slideTotal={props.slideTotal}
        />
        <PresenterControls
          audienceOpening={props.audienceOpening}
          onExit={props.onExit}
          onNext={props.onNext}
          onOpenAudienceScreen={props.onOpenAudienceScreen}
          onPrevious={props.onPrevious}
        />
        <PresenterNextSlidePreview
          {...(props.assets ? { assets: props.assets } : {})}
          slide={props.nextSlide}
        />
        <PresenterNotes slide={props.slide} />
      </aside>
    </main>
  );
}

function PresenterCurrentSlide(props: {
  assets?: ScenarioSlideRenderAssetMap;
  clickIndex: number;
  slide: ScenarioSlide;
}) {
  const current = renderScenarioSlide(props.slide, {
    ...(props.assets ? { assets: props.assets } : {}),
    clickIndex: props.clickIndex,
    mode: 'export',
    outputWidth: 820,
  });

  return (
    <div className="relative min-h-0 overflow-hidden rounded-[8px]">
      <ScenarioPresentationZoomSurface rendered={current}>
        {(zoomedRendered) => (
          <ScenarioPresentationSlideFrame clickIndex={props.clickIndex} rendered={zoomedRendered} />
        )}
      </ScenarioPresentationZoomSurface>
    </div>
  );
}

function PresenterStatus(props: {
  clickIndex: number;
  currentTime: string;
  elapsedSeconds: number;
  slide: ScenarioSlide;
  slideIndex: number;
  slideTotal: number;
}) {
  const build = getScenarioSlideBuildStepSummary(props.slide, props.clickIndex);

  return (
    <section
      className="grid gap-2 rounded-[8px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <ValueBadge className="gap-1">
          <Clock className="h-3.5 w-3.5" />
          {formatTimer(props.elapsedSeconds)}
        </ValueBadge>
        <ValueBadge title={translate('scenario.editor.currentTime')}>
          {props.currentTime}
        </ValueBadge>
      </div>
      <div className="flex flex-wrap gap-2">
        <ValueBadge className="min-w-0">
          {props.slideIndex + 1}/{props.slideTotal}
        </ValueBadge>
        <ValueBadge className="min-w-0">
          {props.clickIndex}/{props.slide.clicks.count}
        </ValueBadge>
        <ValueBadge title={translate('scenario.editor.visibleElements')}>
          {build.visibleElementIds.length}/{props.slide.elements.length}
        </ValueBadge>
      </div>
    </section>
  );
}

function PresenterControls(props: {
  audienceOpening: boolean;
  onExit: () => void;
  onNext: () => void;
  onOpenAudienceScreen: () => void;
  onPrevious: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-[8px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] px-2 py-1"
    >
      <EditorIconButton title={translate('scenario.editor.previous')} onClick={props.onPrevious}>
        <ChevronLeft className="h-4 w-4" />
      </EditorIconButton>
      <EditorIconButton
        disabled={props.audienceOpening}
        title={translate('scenario.editor.openAudienceScreen')}
        onClick={props.onOpenAudienceScreen}
      >
        <MonitorPlay className="h-4 w-4" />
      </EditorIconButton>
      <EditorIconButton
        title={translate('scenario.editor.exitPresentation')}
        onClick={props.onExit}
      >
        <LogOut className="h-4 w-4" />
      </EditorIconButton>
      <EditorIconButton title={translate('scenario.editor.next')} onClick={props.onNext}>
        <ChevronRight className="h-4 w-4" />
      </EditorIconButton>
    </div>
  );
}

function PresenterNextSlidePreview(props: {
  assets?: ScenarioSlideRenderAssetMap;
  slide: ScenarioSlide | null;
}) {
  const rendered = props.slide
    ? renderScenarioSlide(props.slide, {
        ...(props.assets ? { assets: props.assets } : {}),
        clickIndex: 0,
        mode: 'thumbnail',
        outputWidth: 292,
      })
    : null;

  return (
    <section
      className="grid gap-2 rounded-[8px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] p-3"
    >
      <h2 className="text-xs font-semibold uppercase text-[var(--sniptale-color-text-muted)]">
        {translate('scenario.editor.nextSlide')}
      </h2>
      {rendered ? (
        <div
          className="relative overflow-hidden rounded-[6px] border border-[var(--sniptale-color-border-soft)]"
          style={{ height: rendered.canvas.height, width: rendered.canvas.width }}
        >
          <ScenarioCanvasSvgAdapter svg={rendered.svg} />
        </div>
      ) : (
        <p className="text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('scenario.editor.noNextSlide')}
        </p>
      )}
    </section>
  );
}

function PresenterNotes(props: { slide: ScenarioSlide }) {
  return (
    <section
      className="min-h-0 overflow-auto rounded-[8px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] p-3"
    >
      <h2 className="mb-2 text-xs font-semibold uppercase text-[var(--sniptale-color-text-muted)]">
        {translate('scenario.editor.notes')}
      </h2>
      <p className="whitespace-pre-wrap text-sm text-[var(--sniptale-color-text-primary)]">
        {props.slide.notes || props.slide.guide?.body || translate('scenario.editor.noNotes')}
      </p>
    </section>
  );
}

function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function useCurrentPresenterTime(): string {
  const [time, setTime] = useState(() => formatClockTime(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setTime(formatClockTime(new Date())), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return time;
}

function formatClockTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
