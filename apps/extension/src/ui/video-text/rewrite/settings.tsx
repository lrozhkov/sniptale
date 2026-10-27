import { LoaderCircle } from 'lucide-react';
import type { ReviewTextContext } from '../../../contracts/ai/review-text';
import type { AIModelCatalogPayload } from '../../../contracts/messaging/ai-settings-runtime';
import { InspectorParameterRow } from '../../compact-inspector-controls/layout';
import { ToggleField, SegmentedRow, TextareaField } from '../../compact-inspector-controls';
import { AIModelSelector } from '../../../features/ai/model-selector';
import { translate } from '../../../platform/i18n';
import { TextRewriteButton, TextRewriteNumberRow } from './controls';

export type TextRewriteOptions = Pick<
  ReviewTextContext,
  'prompt' | 'mode' | 'wholeDocument' | 'changeIntervals' | 'resegment'
> & { window?: { start: number; end: number } };

/** Shared settings receive explicit values; runtime adapters retain all request authority. */
export function TextRewriteSettings(props: {
  options: TextRewriteOptions;
  catalog: AIModelCatalogPayload | null;
  modelId: string;
  locked: boolean;
  wholeDocument: boolean;
  windowFallback?: { start: number; end: number } | undefined;
  resultDuration: number;
  catalogError: boolean;
  selectionPending: boolean;
  selectionUnavailable: boolean;
  unavailableModelName?: string | null | undefined;
  selectionFailed: boolean;
  onOptionsChange(change: Partial<TextRewriteOptions>): void;
  onModelChange(id: string): void;
  onReloadModels(): void;
}) {
  const { options, wholeDocument } = props;
  const locked = props.locked || props.selectionPending;
  const window = options.window ?? props.windowFallback;
  const patch = props.onOptionsChange;
  return (
    <fieldset disabled={locked} className="min-w-0 sniptale-parameter-stack">
      <InspectorParameterRow stacked label={translate('gallery.videoReview.textRewriteModel')}>
        {props.catalog ? (
          <AIModelSelector
            models={props.catalog.models}
            providers={props.catalog.providers}
            onOpen={props.onReloadModels}
            selectedModelId={props.modelId || null}
            onSelect={(id) => props.onModelChange(id ?? '')}
            disabled={locked}
          />
        ) : (
          !props.catalogError && (
            <span role="status" className="flex items-center gap-1 text-xs">
              <LoaderCircle size={14} className="animate-spin" />
              {translate('common.states.loading')}
            </span>
          )
        )}
      </InspectorParameterRow>
      {props.selectionPending && (
        <p role="status" className="text-xs">
          {translate('common.states.saving')}
        </p>
      )}
      {props.selectionUnavailable && (
        <p role="status" className="text-xs">
          <bdi className="[overflow-wrap:anywhere]">{props.unavailableModelName}</bdi>{' '}
          {translate('aiModal.modelSelectionUnavailable')}
        </p>
      )}
      {props.selectionFailed && (
        <p role="alert" className="text-xs">
          {translate('aiModal.modelSelectionSaveFailed')}
        </p>
      )}
      {props.catalogError && (
        <p role="alert" className="text-xs">
          {translate('aiModal.modelCatalogFailed')}
        </p>
      )}
      {((!props.catalog && props.catalogError) || props.catalog?.models.length === 0) && (
        <TextRewriteButton
          label={translate('gallery.videoReview.speechReloadModels')}
          onClick={props.onReloadModels}
        >
          {translate('gallery.videoReview.speechReloadModels')}
        </TextRewriteButton>
      )}
      <TextareaField
        label={translate('gallery.videoReview.textRewritePrompt')}
        rows={3}
        value={options.prompt}
        maxLength={4_000}
        onChange={(prompt) => patch({ prompt })}
      />
      <SegmentedRow
        ariaLabel={translate('gallery.videoReview.textRewriteMode')}
        columns={2}
        label={translate('gallery.videoReview.textRewriteMode')}
        value={options.mode}
        options={[
          { value: 'phrases', label: translate('gallery.videoReview.textRewritePhrases') },
          { value: 'script', label: translate('gallery.videoReview.textRewriteScript') },
        ]}
        onChange={(mode: 'phrases' | 'script') => patch({ mode, resegment: false })}
      />
      <ToggleField
        label={translate('gallery.videoReview.textRewriteTiming')}
        value={options.changeIntervals}
        onChange={(changeIntervals) => patch({ changeIntervals, resegment: false })}
      />
      {options.changeIntervals && window && (
        <>
          <p className="text-xs">{translate('gallery.videoReview.textRewriteWindow')}</p>
          <TextRewriteNumberRow
            label={translate('gallery.videoReview.selectionStart')}
            unit="s"
            min={0}
            max={window.end}
            step={0.1}
            value={window.start}
            onChange={(start) => patch({ window: { start, end: window.end } })}
          />
          <TextRewriteNumberRow
            label={translate('gallery.videoReview.selectionEnd')}
            unit="s"
            min={window.start}
            max={props.resultDuration}
            step={0.1}
            value={window.end}
            onChange={(end) => patch({ window: { start: window.start, end } })}
          />
        </>
      )}
      {wholeDocument && options.mode === 'script' && options.changeIntervals && (
        <ToggleField
          label={translate('gallery.videoReview.textRewriteStructure')}
          value={options.resegment}
          onChange={(resegment) => patch({ resegment })}
        />
      )}
    </fieldset>
  );
}
