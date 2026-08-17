import type { StepBadgePreset } from '@sniptale/runtime-contracts/highlighter/step-badge';
import { useState } from 'react';

import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetMeta,
} from '@sniptale/ui/product-glass-controls';
import { CopyPlus, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { getStepBadgePresetDisplayName } from '../../../features/highlighter/step-badge-presets/display-name';
import { translate, useAppLocale } from '../../../platform/i18n';
import { PresetNameWithOverflowHint } from '../../../ui/compact-inspector-controls/overflow-hint';
import { StepBadgePresetPreview } from '../../../ui/highlighter-preset-editor/step-badge/thumbnail';
import { useOpeningPresetSelection } from '../popover/preset-order';
import {
  AnnotationTemplatePresetMetaLine,
  AnnotationTemplateQuerySurface,
  queryAnnotationTemplateValues,
  resolveAnnotationTemplateTags,
  useAnnotationTemplateTagState,
} from '../../../ui/annotation-template-query';

export function StepBadgePresetSection(props: {
  activePresetId?: string;
  error: string | null;
  onApply: (preset: StepBadgePreset) => void;
  onFork: (preset: StepBadgePreset) => void;
  onFloatingInteractionChange?: (open: boolean) => void;
  onReset: (preset: StepBadgePreset) => void;
  onToggle: (preset: StepBadgePreset) => void;
  pending: ReadonlySet<string>;
  presets: StepBadgePreset[];
}) {
  const locale = useAppLocale();
  const [query, setQuery] = useState('');
  const tagState = useAnnotationTemplateTagState();
  const presets = props.presets ?? [];
  const enabledCount = presets.filter((preset) => preset.enabled !== false).length;
  const opening = useOpeningPresetSelection(presets, props.activePresetId);
  const orderedPresets = queryAnnotationTemplateValues({
    activeFilterTagIds: tagState.state.activeFilterTagIds,
    ...(opening.openingActivePresetId ? { activeTemplateId: opening.openingActivePresetId } : {}),
    getDisplayName: (preset) => getStepBadgePresetDisplayName(preset, locale),
    getTagIds: (preset) => preset.tagIds,
    query,
    tags: tagState.state.tags,
    values: opening.orderedPresets,
  });
  return (
    <ContentPopoverSection>
      <AnnotationTemplateQuerySurface
        activeFilterTagIds={tagState.state.activeFilterTagIds}
        disabled={tagState.isLoading || tagState.error}
        hasResults={orderedPresets.length > 0}
        loading={tagState.isLoading}
        onActiveFilterTagIdsChange={tagState.setActiveFilterTagIds}
        {...(props.onFloatingInteractionChange
          ? { onFloatingInteractionChange: props.onFloatingInteractionChange }
          : {})}
        onQueryChange={setQuery}
        query={query}
        tags={tagState.state.tags}
      >
        <ProductGlassPresetList scrollable variant="menu">
          {orderedPresets.map((preset) => {
            const disabled = preset.enabled === false;
            const pending = props.pending.has(preset.id);
            return (
              <div
                className="sniptale-callout-preset-row"
                data-disabled={disabled ? 'true' : undefined}
                key={preset.id}
              >
                <ProductGlassPresetItem
                  active={props.activePresetId === preset.id}
                  disabled={disabled}
                  onClick={() => props.onApply(preset)}
                  showActiveIndicator
                >
                  <StepBadgePresetPreview compact settings={preset.settings} />
                  <ProductGlassPresetMeta>
                    <AnnotationTemplatePresetMetaLine
                      name={
                        <PresetNameWithOverflowHint
                          name={getStepBadgePresetDisplayName(preset, locale)}
                        />
                      }
                      tags={resolveAnnotationTemplateTags(preset.tagIds, tagState.state.tags)}
                    />
                  </ProductGlassPresetMeta>
                </ProductGlassPresetItem>
                <span className="sniptale-callout-preset-actions">
                  <button
                    aria-label={translate('content.templateFork.fork')}
                    className="sniptale-callout-preset-action"
                    data-template-fork-source={preset.id}
                    disabled={pending}
                    onClick={() => props.onFork(preset)}
                    title={translate('content.templateFork.fork')}
                    type="button"
                  >
                    <CopyPlus size={15} />
                  </button>
                  {preset.origin === 'system' && preset.customized === true ? (
                    <button
                      className="sniptale-callout-preset-action"
                      disabled={pending}
                      onClick={() => props.onReset(preset)}
                      title={translate('highlighter.stepBadgePresets.reset')}
                      type="button"
                    >
                      <RotateCcw size={15} />
                    </button>
                  ) : null}
                  <button
                    className="sniptale-callout-preset-action"
                    disabled={pending || (!disabled && enabledCount <= 1)}
                    onClick={() => props.onToggle(preset)}
                    title={translate(
                      disabled ? 'content.stepBadge.showPreset' : 'content.stepBadge.hidePreset'
                    )}
                    type="button"
                  >
                    {disabled ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                </span>
              </div>
            );
          })}
        </ProductGlassPresetList>
      </AnnotationTemplateQuerySurface>
      {props.error ? <div role="alert">{props.error}</div> : null}
    </ContentPopoverSection>
  );
}
