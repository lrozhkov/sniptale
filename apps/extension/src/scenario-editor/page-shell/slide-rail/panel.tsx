import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { translate } from '../../../platform/i18n';
import type { ScenarioSlideRenderAssetMap } from '../../project/stage-render/slide';
import {
  createScenarioSlideSvgDataUrl,
  renderScenarioSlide,
} from '../../project/stage-render/slide';
import type { ScenarioSlide } from '@sniptale/runtime-contracts/scenario/types/v3';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { cx } from '../../../ui/compact-inspector-controls';
import type { ScenarioSlideRailProps } from './types';

type ScenarioSlideRailActions = Pick<
  ScenarioSlideRailProps,
  'onDeleteSlide' | 'onDuplicateSlide' | 'onMoveSlide' | 'onSelectSlide'
>;

const RAIL_ACTION_BUTTON_CLASS_NAME = 'h-[28px] w-[28px] shrink-0';

function RailIconButton(props: {
  active?: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <EditorIconButton
      title={props.label}
      onClick={props.onClick}
      className={RAIL_ACTION_BUTTON_CLASS_NAME}
      {...(props.active === undefined ? {} : { active: props.active })}
    >
      {props.children}
    </EditorIconButton>
  );
}

export function ScenarioSlideRail(props: ScenarioSlideRailProps) {
  const actions: ScenarioSlideRailActions = {
    onDeleteSlide: props.onDeleteSlide,
    onDuplicateSlide: props.onDuplicateSlide,
    onMoveSlide: props.onMoveSlide,
    onSelectSlide: props.onSelectSlide,
  };

  return (
    <aside
      data-ui="scenario.slide-rail.panel"
      className={cx(
        'grid h-full min-h-0 grid-rows-[auto_1fr]',
        props.embedded ? 'w-full' : 'w-[296px] border-l',
        `
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]
      `
      )}
    >
      <ScenarioSlideRailHeader {...props} />
      <ScenarioSlideRailBody actions={actions} {...props} />
    </aside>
  );
}

function ScenarioSlideRailHeader(props: ScenarioSlideRailProps) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--sniptale-color-border-soft)] p-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('scenario.editor.steps')}
        </h2>
        <div className="text-xs text-[var(--sniptale-color-text-muted)]">
          {props.slides.length} {translate('scenario.editor.stepsCount')}
        </div>
      </div>
      <ScenarioSlideRailHeaderActions {...props} />
    </div>
  );
}

function ScenarioSlideRailHeaderActions(props: ScenarioSlideRailProps) {
  return (
    <div className="flex items-center gap-1">
      <RailIconButton label={translate('scenario.editor.addStep')} onClick={props.onAddSlide}>
        <Plus className="h-4 w-4" />
      </RailIconButton>
      {props.onCollapsePanel ? (
        <RailIconButton
          label={translate('scenario.editor.collapseNavigator')}
          onClick={props.onCollapsePanel}
        >
          <ChevronDown className="h-4 w-4" />
        </RailIconButton>
      ) : null}
    </div>
  );
}

function ScenarioSlideRailBody(
  props: ScenarioSlideRailProps & { actions: ScenarioSlideRailActions }
) {
  return (
    <div className="min-h-0 overflow-auto p-3">
      <ScenarioSlideRailCardList {...props} />
    </div>
  );
}

function ScenarioSlideRailCardList(
  props: ScenarioSlideRailProps & { actions: ScenarioSlideRailActions }
) {
  return (
    <div className="grid gap-3">
      {props.slides.map((slide, index) => (
        <ScenarioSlideRailCard
          key={slide.id}
          actions={props.actions}
          assets={props.assets}
          index={index}
          selected={slide.id === props.selectedSlideId}
          slide={slide}
        />
      ))}
    </div>
  );
}

function ScenarioSlideRailCard(props: {
  actions: ScenarioSlideRailActions;
  assets: ScenarioSlideRenderAssetMap | undefined;
  index: number;
  selected: boolean;
  slide: ScenarioSlide;
}) {
  return (
    <article
      className={cx(
        'grid gap-2 rounded-[8px] border p-2 transition',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_74%,transparent)]',
        'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_74%,transparent)]',
        props.selected &&
          'border-[var(--sniptale-color-border-accent-strong)] ' +
            'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]'
      )}
    >
      <SlideRailSelectButton {...props} />
      <SlideRailRowActions actions={props.actions} slideId={props.slide.id} />
    </article>
  );
}

function SlideRailSelectButton(props: {
  actions: ScenarioSlideRailActions;
  assets: ScenarioSlideRenderAssetMap | undefined;
  index: number;
  selected: boolean;
  slide: ScenarioSlide;
}) {
  const thumbnail = createSlideThumbnail(props.slide, props.assets);

  return (
    <button
      type="button"
      onClick={() => props.actions.onSelectSlide(props.slide.id)}
      className="grid gap-2 text-left"
      aria-pressed={props.selected}
    >
      <span
        className="relative block aspect-video overflow-hidden rounded-[8px] border
          border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)]"
      >
        <img
          alt={translate('scenario.editor.slideThumbnailAlt')}
          className="h-full w-full object-cover"
          src={thumbnail}
        />
        <span
          className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-[7px]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)] px-1.5
            text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]"
        >
          {props.index + 1}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {props.slide.title || translate('scenario.editor.untitledStep')}
        </span>
        <span className="block text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('scenario.editor.stepNumber')} {props.index + 1}
        </span>
      </span>
    </button>
  );
}

function createSlideThumbnail(
  slide: ScenarioSlide,
  assets: ScenarioSlideRenderAssetMap | undefined
) {
  const rendered = renderScenarioSlide(slide, {
    ...(assets === undefined ? {} : { assets }),
    clickIndex: slide.clicks.count,
    missingAssetLabel: '',
    mode: 'thumbnail',
    outputWidth: 252,
  });
  return createScenarioSlideSvgDataUrl(rendered.svg);
}

function SlideRailRowActions(props: { actions: ScenarioSlideRailActions; slideId: string }) {
  return (
    <div
      className="flex items-center justify-end gap-1 border-t border-[var(--sniptale-color-border-soft)] pt-1"
      onClick={(event) => event.stopPropagation()}
    >
      <RailIconButton
        label={translate('scenario.editor.moveStepUp')}
        onClick={() => props.actions.onMoveSlide(props.slideId, 'up')}
      >
        <ChevronUp className="h-4 w-4" />
      </RailIconButton>
      <RailIconButton
        label={translate('scenario.editor.moveStepDown')}
        onClick={() => props.actions.onMoveSlide(props.slideId, 'down')}
      >
        <ChevronDown className="h-4 w-4" />
      </RailIconButton>
      <RailIconButton
        label={translate('scenario.editor.duplicateStep')}
        onClick={() => props.actions.onDuplicateSlide(props.slideId)}
      >
        <Copy className="h-4 w-4" />
      </RailIconButton>
      <RailIconButton
        label={translate('scenario.editor.deleteStep')}
        onClick={() => props.actions.onDeleteSlide(props.slideId)}
      >
        <Trash2 className="h-4 w-4" />
      </RailIconButton>
    </div>
  );
}
