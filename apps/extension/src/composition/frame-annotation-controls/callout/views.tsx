import type { CalloutAnchor, CalloutPreset } from '@sniptale/runtime-contracts/highlighter/callout';
import { useState } from 'react';

import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import {
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetMeta,
} from '@sniptale/ui/product-glass-controls';
import { CopyPlus, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { getCalloutPresetDisplayName } from '../../../features/highlighter/callout-presets/display-name';
import { translate, useAppLocale } from '../../../platform/i18n';
import { CalloutPresetPreview } from '../../../ui/highlighter-preset-editor/callout/thumbnail';
import { PresetNameWithOverflowHint } from '../../../ui/compact-inspector-controls/overflow-hint';
import { CalloutSettingsPositionGrid } from '../../../ui/highlighter-preset-editor/callout/position-grid';
import {
  resolveCalloutColorBindings,
  type CalloutFrameColors,
} from '../../../features/highlighter/callout-color-bindings';
import { useOpeningPresetSelection } from '../popover/preset-order';
import {
  AnnotationTemplateQueryControls,
  AnnotationTemplateQueryEmpty,
  AnnotationTemplatePresetMetaLine,
  AnnotationTemplateQueryResults,
  queryAnnotationTemplateValues,
  resolveAnnotationTemplateTags,
  useAnnotationTemplateTagState,
} from '../../../ui/annotation-template-query';

export function CalloutPresetSection(props: {
  activePresetId?: string;
  onApplyPreset: (preset: CalloutPreset) => void;
  onForkPreset: (preset: CalloutPreset) => void;
  onResetPreset?: ((preset: CalloutPreset) => void) | undefined;
  onTogglePreset: (preset: CalloutPreset) => void;
  pendingPresetIds: ReadonlySet<string>;
  presets: CalloutPreset[];
  error: string | null;
  frameColors?: CalloutFrameColors;
}) {
  const locale = useAppLocale();
  const [query, setQuery] = useState('');
  const tagState = useAnnotationTemplateTagState();
  const enabledPresetCount = props.presets.filter((preset) => preset.enabled !== false).length;
  const opening = useOpeningPresetSelection(props.presets, props.activePresetId);
  const orderedPresets = queryAnnotationTemplateValues({
    activeFilterTagIds: tagState.state.activeFilterTagIds,
    ...(opening.openingActivePresetId ? { activeTemplateId: opening.openingActivePresetId } : {}),
    getDisplayName: (preset) => getCalloutPresetDisplayName(preset, locale),
    getTagIds: (preset) => preset.tagIds,
    query,
    tags: tagState.state.tags,
    values: opening.orderedPresets,
  });
  return (
    <ContentPopoverSection dataUi="content.callout-settings.presets-section">
      <AnnotationTemplateQueryControls
        activeFilterTagIds={tagState.state.activeFilterTagIds}
        compact
        disabled={tagState.isLoading || tagState.error}
        onActiveFilterTagIdsChange={tagState.setActiveFilterTagIds}
        onQueryChange={setQuery}
        query={query}
        tags={tagState.state.tags}
      />
      <AnnotationTemplateQueryResults loading={tagState.isLoading}>
        {orderedPresets.length === 0 ? (
          <AnnotationTemplateQueryEmpty
            hasFilter={tagState.state.activeFilterTagIds.length > 0}
            onClearFilter={() => void tagState.setActiveFilterTagIds([])}
            onClearQuery={() => setQuery('')}
            query={query}
          />
        ) : (
          <ProductGlassPresetList
            className="sniptale-callout-preset-list"
            scrollable
            variant="menu"
          >
            {orderedPresets.map((preset) => {
              const pending = props.pendingPresetIds.has(preset.id);
              const disabled = preset.enabled === false;
              const displayName = getCalloutPresetDisplayName(preset, locale);
              return (
                <div
                  className="sniptale-callout-preset-row"
                  data-disabled={disabled ? 'true' : undefined}
                  key={preset.id}
                >
                  <ProductGlassPresetItem
                    active={props.activePresetId === preset.id}
                    disabled={disabled}
                    onClick={() => props.onApplyPreset(preset)}
                    showActiveIndicator
                  >
                    <CalloutPresetPreview
                      compact
                      placement={preset.placement}
                      style={resolveCalloutColorBindings(preset.style, props.frameColors ?? {})}
                    />
                    <ProductGlassPresetMeta>
                      <AnnotationTemplatePresetMetaLine
                        name={<PresetNameWithOverflowHint name={displayName} />}
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
                      onClick={() => props.onForkPreset(preset)}
                      title={translate('content.templateFork.fork')}
                      type="button"
                    >
                      <CopyPlus size={15} />
                    </button>
                    {preset.origin === 'system' &&
                    preset.customized === true &&
                    props.onResetPreset ? (
                      <button
                        aria-label={translate('highlighter.calloutPresets.reset')}
                        className="sniptale-callout-preset-action"
                        disabled={pending}
                        onClick={() => props.onResetPreset?.(preset)}
                        title={translate('highlighter.calloutPresets.reset')}
                        type="button"
                      >
                        <RotateCcw size={15} />
                      </button>
                    ) : null}
                    <button
                      aria-label={translate(
                        disabled ? 'content.callout.showPreset' : 'content.callout.hidePreset'
                      )}
                      className="sniptale-callout-preset-action"
                      disabled={pending || (!disabled && enabledPresetCount <= 1)}
                      onClick={() => props.onTogglePreset(preset)}
                      title={translate(
                        disabled ? 'content.callout.showPreset' : 'content.callout.hidePreset'
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
        )}
      </AnnotationTemplateQueryResults>
      {props.error ? <div role="alert">{props.error}</div> : null}
    </ContentPopoverSection>
  );
}

export function CalloutPositionSection(props: {
  anchor: CalloutAnchor;
  embedded?: boolean;
  onChange: (anchor: CalloutAnchor) => void;
}) {
  const grid = (
    <CalloutSettingsPositionGrid layout="square" anchor={props.anchor} onChange={props.onChange} />
  );
  return props.embedded ? (
    grid
  ) : (
    <ContentPopoverSection title={translate('content.callout.positionSection')}>
      {grid}
    </ContentPopoverSection>
  );
}
