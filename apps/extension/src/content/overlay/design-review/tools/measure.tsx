import { useLayoutEffect, useState } from 'react';
import { ArrowLeftRight, RotateCcw, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { InspectorDisclosureView } from '../../../../ui/compact-inspector-controls/disclosure';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import {
  createDesignReviewMeasureState,
  type DesignReviewMeasureState,
} from '../../../selection/design-review/measure';
import {
  beginDesignReviewMeasureSelection,
  acceptDesignReviewMeasureSelection,
  swapDesignReviewMeasureTargets,
  clearDesignReviewMeasure,
  clearDesignReviewMeasureB,
} from '../../../selection/design-review';
import { formatMeasureNumber, measureTargetLabel, readMeasurePair } from './measure-model';

export type MeasureModel = ReturnType<typeof readMeasurePair>;

/** Samples only the two active targets; accepted identities remain in the selection owner. */
export function useDesignReviewMeasureModel(
  state: DesignReviewMeasureState | undefined,
  active: boolean
) {
  const [model, setModel] = useState<MeasureModel>(() =>
    readMeasurePair(state ?? createDesignReviewMeasureState())
  );
  useLayoutEffect(() => {
    if (!active || !state) return;
    let frame = 0;
    let previous = '';
    const sample = () => {
      const next = readMeasurePair(state);
      const signature = JSON.stringify([
        window.innerWidth,
        window.innerHeight,
        next.kind,
        next.rectA,
        next.rectB,
        next.kind === 'ready' ? next.differences : null,
      ]);
      if (signature !== previous) {
        previous = signature;
        setModel(next);
      }
      frame = requestAnimationFrame(sample);
    };
    sample();
    return () => cancelAnimationFrame(frame);
  }, [state, active]);
  return model;
}

const GROUP_LABELS: Record<string, TranslationKey> = {
  text: 'content.designReview.sectionText',
  size: 'content.designReview.measureSizes',
  fill: 'content.designReview.backgroundColor',
  border: 'content.designReview.sectionBorder',
};
const PROPERTY_LABELS: Record<string, TranslationKey> = {
  'text-align': 'content.designReview.textAlign',
  'font-family': 'content.designReview.fontFamily',
  'font-size': 'content.designReview.fontSize',
  'font-weight': 'content.designReview.fontWeight',
  'line-height': 'content.designReview.lineHeight',
  'letter-spacing': 'content.designReview.letterSpacing',
  color: 'content.designReview.color',
  width: 'content.designReview.width',
  height: 'content.designReview.height',
  'background-color': 'content.designReview.backgroundColor',
  'border-radius': 'content.designReview.borderRadius',
};

function TargetSlot(props: { slot: 'a' | 'b'; state: DesignReviewMeasureState }) {
  const target = props.state[props.slot];
  const choosing = props.state.slot === props.slot;
  return (
    <div
      className="flex min-w-0 items-center gap-2 py-2"
      data-ui={`content.design-review.measure-target.${props.slot}`}
    >
      <span className="w-4 shrink-0 font-semibold">{props.slot.toUpperCase()}</span>
      <span className="min-w-0 flex-1 truncate" title={measureTargetLabel(target)}>
        {target
          ? [
              measureTargetLabel(target),
              !target.isConnected ? translate('content.designReview.measureUnavailable') : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : translate('content.designReview.measureNotChosen')}
      </span>
      <ProductActionButton
        compact
        tone="secondary"
        aria-pressed={choosing}
        disabled={props.slot === 'b' && !props.state.a}
        aria-label={translate(
          props.slot === 'a'
            ? 'content.designReview.measureChooseA'
            : 'content.designReview.measureChooseB'
        )}
        onClick={() => beginDesignReviewMeasureSelection(props.slot)}
      >
        {translate(
          target ? 'content.designReview.measureReplace' : 'content.designReview.measureChoose'
        )}
      </ProductActionButton>
      {props.slot === 'b' && target ? (
        <ContentToolbarButton
          tone="utility"
          className="!size-6 !min-h-6 !min-w-6 !p-0"
          aria-label={translate('content.designReview.measureClearB')}
          onClick={clearDesignReviewMeasureB}
        >
          <X size={13} />
        </ContentToolbarButton>
      ) : null}
    </div>
  );
}

export function DesignReviewMeasureSection(props: {
  state: DesignReviewMeasureState;
  model: MeasureModel;
  current: Element | null;
}) {
  const [group, setGroup] = useState<string | null>('text');
  const { state, model } = props;
  return (
    <div className="min-w-0 text-xs" data-ui="content.design-review.measure-controls">
      <div className="border-b border-[var(--sniptale-color-border-soft)] py-1">
        <TargetSlot slot="a" state={state} />
        <TargetSlot slot="b" state={state} />
        <div className="flex items-center justify-end gap-1 pb-2">
          <ContentToolbarButton
            tone="utility"
            className="!size-6 !min-h-6 !min-w-6 !p-0"
            disabled={!state.a || !state.b}
            aria-label={translate('content.designReview.measureSwap')}
            title={translate('content.designReview.measureSwap')}
            onClick={swapDesignReviewMeasureTargets}
          >
            <ArrowLeftRight size={14} />
          </ContentToolbarButton>
          <ContentToolbarButton
            tone="utility"
            className="!size-6 !min-h-6 !min-w-6 !p-0"
            disabled={!state.a && !state.b}
            aria-label={translate('content.designReview.measureClear')}
            title={translate('content.designReview.measureClear')}
            onClick={clearDesignReviewMeasure}
          >
            <RotateCcw size={14} />
          </ContentToolbarButton>
        </div>
      </div>
      <MeasureSelectionPrompt state={state} current={props.current} />
      {model.kind === 'unavailable' ? (
        <p role="status" className="py-3">
          {translate('content.designReview.measureUnavailableHint')}
        </p>
      ) : null}
      {model.kind === 'ready' ? (
        <>
          <MeasureGeometry model={model} preview={Boolean(state.preview)} />
          <MeasureDifferences model={model} group={group} setGroup={setGroup} />
        </>
      ) : null}
    </div>
  );
}

function MeasureSelectionPrompt({
  state,
  current,
}: {
  state: DesignReviewMeasureState;
  current: Element | null;
}) {
  const choosing = state.slot;
  const canAccept = Boolean(
    choosing && current?.isConnected && current !== (choosing === 'a' ? state.b : state.a)
  );
  if (!choosing) return null;
  return (
    <div className="grid gap-2 py-3">
      <p role="status" className="text-[var(--sniptale-color-text-secondary)]">
        {translate(
          choosing === 'a'
            ? 'content.designReview.measurePickA'
            : 'content.designReview.measurePickB'
        )}
      </p>
      {canAccept ? (
        <ProductActionButton compact tone="secondary" onClick={acceptDesignReviewMeasureSelection}>
          {translate('content.designReview.measureUseCurrent').replace(
            '{slot}',
            choosing.toUpperCase()
          )}
        </ProductActionButton>
      ) : null}
    </div>
  );
}

function MeasureGeometry({
  model,
  preview,
}: {
  model: Extract<MeasureModel, { kind: 'ready' }>;
  preview: boolean;
}) {
  return (
    <>
      <dl
        className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 py-3 tabular-nums"
        data-ui="content.design-review.measure-geometry"
      >
        <dt>A</dt>
        <dd>
          {formatMeasureNumber(model.rectA.width)} × {formatMeasureNumber(model.rectA.height)}{' '}
          {translate('content.callout.unitPxSuffix')}
        </dd>
        <dt>B{preview ? ' · ' + translate('content.designReview.measurePreview') : ''}</dt>
        <dd>
          {formatMeasureNumber(model.rectB.width)} × {formatMeasureNumber(model.rectB.height)}{' '}
          {translate('content.callout.unitPxSuffix')}
        </dd>
        <dt>
          {translate(
            model.geometry.overlapX > 0
              ? 'content.designReview.measureOverlapX'
              : 'content.designReview.measureGapX'
          )}
        </dt>
        <dd>
          {formatMeasureNumber(model.geometry.overlapX || model.geometry.gapX)}{' '}
          {translate('content.callout.unitPxSuffix')}
        </dd>
        <dt>
          {translate(
            model.geometry.overlapY > 0
              ? 'content.designReview.measureOverlapY'
              : 'content.designReview.measureGapY'
          )}
        </dt>
        <dd>
          {formatMeasureNumber(model.geometry.overlapY || model.geometry.gapY)}{' '}
          {translate('content.callout.unitPxSuffix')}
        </dd>
      </dl>
      {model.geometry.insets ? (
        <p className="pb-2 tabular-nums">
          {translate('content.designReview.measureInsets')
            .replace('{outer}', model.geometry.contains === 'a' ? 'A' : 'B')
            .replace('{inner}', model.geometry.contains === 'a' ? 'B' : 'A')}
          <br />
          {translate('content.designReview.measureInsetValues')
            .replace('{left}', formatMeasureNumber(model.geometry.insets.left))
            .replace('{top}', formatMeasureNumber(model.geometry.insets.top))
            .replace('{right}', formatMeasureNumber(model.geometry.insets.right))
            .replace('{bottom}', formatMeasureNumber(model.geometry.insets.bottom))}
        </p>
      ) : null}
      <p className="pb-3 text-[var(--sniptale-color-text-secondary)]">
        {translate('content.designReview.measureGeometryHint')}
      </p>
    </>
  );
}

function MeasureDifferences({
  model,
  group,
  setGroup,
}: {
  model: Extract<MeasureModel, { kind: 'ready' }>;
  group: string | null;
  setGroup(value: string | null): void;
}) {
  return (
    <>
      {model.differences
        .filter((item) => item.values.length)
        .map((item) => (
          <InspectorDisclosureView
            key={item.group}
            dataUi={`content.design-review.measure-difference.${item.group}`}
            variant="structural"
            label={translate(GROUP_LABELS[item.group] ?? 'content.designReview.inspectStyles')}
            open={group === item.group}
            onOpenChange={(open) => setGroup(open ? item.group : null)}
            bodyClassName="grid gap-3 px-2 py-2"
          >
            {item.values.map((value) => (
              <div key={value.property} className="min-w-0">
                <p className="mb-1 text-[var(--sniptale-color-text-secondary)]">
                  {PROPERTY_LABELS[value.property]
                    ? translate(PROPERTY_LABELS[value.property]!)
                    : value.property}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0 break-words">{`A · ${value.a || '—'}`}</div>
                  <div className="min-w-0 break-words">{`B · ${value.b || '—'}`}</div>
                </div>
              </div>
            ))}
          </InspectorDisclosureView>
        ))}
      {!model.differences.some((item) => item.values.length) ? (
        <p className="py-2">{translate('content.designReview.measureNoDifferences')}</p>
      ) : null}
    </>
  );
}
