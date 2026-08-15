import { useState } from 'react';
import { translate, useAppLocale } from '../../../../../platform/i18n';
import { getStepBadgePresetDisplayName } from '../../../../../features/highlighter/step-badge-presets/display-name';
import { StepBadgePresetPreview } from '../../../../../ui/highlighter-preset-editor/step-badge/thumbnail';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';
import type { StepBadgePresetCatalogController } from './types';
import {
  AnnotationTemplateQueryControls,
  AnnotationTemplateQueryEmpty,
  AnnotationTemplateTagChips,
  queryAnnotationTemplateValues,
  resolveAnnotationTemplateTags,
  useAnnotationTemplateTagState,
} from '../../../../../ui/annotation-template-query';
import { DEFAULT_ANNOTATION_SESSION_DEFAULTS } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { AnnotationNewSessionDefaults } from '../new-session-defaults';

export function StepBadgePresetsPanel({
  controller,
}: {
  controller: StepBadgePresetCatalogController;
}) {
  const locale = useAppLocale();
  const [query, setQuery] = useState('');
  const tagState = useAnnotationTemplateTagState();
  const sourcePresets = controller.catalog?.presets ?? [];
  const presets = queryAnnotationTemplateValues({
    activeFilterTagIds: tagState.state.activeFilterTagIds,
    ...(controller.catalog?.defaultPresetId
      ? { activeTemplateId: controller.catalog.defaultPresetId }
      : {}),
    getDisplayName: (preset) => getStepBadgePresetDisplayName(preset, locale),
    getTagIds: (preset) => preset.tagIds,
    query,
    tags: tagState.state.tags,
    values: sourcePresets,
  });
  const enabledCount = sourcePresets.filter((preset) => preset.enabled !== false).length;
  const items: readonly SettingsCollectionItem[] = presets.map((preset) => ({
    id: preset.id,
    title: getStepBadgePresetDisplayName(preset, locale),
    meta:
      preset.settings.style.sizeSource === 'frame-border'
        ? translate('content.stepBadge.sizeFromFrame')
        : `${preset.settings.style.diameter} px`,
    preview: <StepBadgePresetPreview settings={preset.settings} />,
    supplement: (
      <AnnotationTemplateTagChips
        tags={resolveAnnotationTemplateTags(preset.tagIds, tagState.state.tags)}
      />
    ),
    enabled: preset.enabled !== false,
    isDefault: controller.catalog?.defaultPresetId === preset.id,
    busy: controller.isSaving,
    isBuiltIn: preset.origin === 'system',
    capabilities: {
      edit: true,
      toggle: true,
      setDefault: controller.catalog?.defaultPresetId !== preset.id,
      reset: preset.origin === 'system' && preset.customized === true,
      delete: preset.origin !== 'system',
      reorder: true,
    },
    disabledActions: {
      ...(preset.enabled !== false && enabledCount <= 1
        ? { toggle: translate('highlighter.stepBadgePresets.lastEnabled') }
        : {}),
      ...(preset.enabled === false
        ? { 'set-default': translate('highlighter.stepBadgePresets.makeDefault') }
        : {}),
    },
  }));
  const byId = new Map(presets.map((preset) => [preset.id, preset]));
  const onAction = (action: SettingsCollectionAction) => {
    const preset = byId.get(action.itemId);
    if (!preset) return;
    if (action.type === 'toggle') void controller.actions.toggle(preset.id);
    if (action.type === 'set-default') void controller.actions.setDefault(preset.id);
    if (action.type === 'edit') controller.actions.edit(preset);
    if (action.type === 'reset') void controller.actions.reset(preset.id);
    if (action.type === 'delete') void controller.actions.delete(preset);
  };
  return (
    <div>
      <AnnotationNewSessionDefaults
        copy={{
          enabledDescription: translate(
            'highlighter.stepBadgePresets.newSession.enabledDescription'
          ),
          enabledLabel: translate('highlighter.stepBadgePresets.newSession.enabledLabel'),
          frameTemplate: translate('highlighter.stepBadgePresets.newSession.frameTemplate'),
          primaryTemplate: translate('highlighter.stepBadgePresets.newSession.primaryTemplate'),
          sourceDescription: translate('highlighter.stepBadgePresets.newSession.sourceDescription'),
          sourceLabel: translate('highlighter.stepBadgePresets.newSession.sourceLabel'),
          sectionDescription: translate(
            'highlighter.stepBadgePresets.newSession.sectionDescription'
          ),
          sectionTitle: translate('highlighter.stepBadgePresets.newSession.sectionTitle'),
        }}
        defaults={controller.catalog?.newSessionDefaults ?? DEFAULT_ANNOTATION_SESSION_DEFAULTS}
        disabled={controller.isLoading || controller.isSaving || !controller.catalog}
        onEnabledChange={(enabled) => void controller.actions.setNewSessionEnabled(enabled)}
        onTemplateSourceChange={(source) =>
          void controller.actions.setNewSessionTemplateSource(source)
        }
      />
      <SettingsCollection
        ariaLabel={translate('highlighter.stepBadgePresets.title')}
        toolbarControls={
          <AnnotationTemplateQueryControls
            activeFilterTagIds={tagState.state.activeFilterTagIds}
            disabled={tagState.isLoading || tagState.error}
            onActiveFilterTagIdsChange={tagState.setActiveFilterTagIds}
            onQueryChange={setQuery}
            query={query}
            tags={tagState.state.tags}
          />
        }
        items={items}
        state={controller.isLoading ? 'loading' : controller.error ? 'error' : 'ready'}
        errorState={translate('highlighter.stepBadgePresets.messages.loadError')}
        addAction={{
          label: translate('highlighter.stepBadgePresets.add'),
          disabled: controller.isSaving,
          onInvoke: controller.actions.add,
        }}
        emptyState={
          sourcePresets.length > 0 ? (
            <AnnotationTemplateQueryEmpty
              hasFilter={tagState.state.activeFilterTagIds.length > 0}
              onClearFilter={() => void tagState.setActiveFilterTagIds([])}
              onClearQuery={() => setQuery('')}
              query={query}
            />
          ) : undefined
        }
        onAction={onAction}
        onMove={(intent: SettingsCollectionMoveIntent) =>
          void controller.actions.moveBefore(intent.itemId, intent.beforeItemId)
        }
      />
    </div>
  );
}
