import { useState } from 'react';
import { useAppLocale, translate } from '../../../../../platform/i18n';
import { getCalloutPresetDisplayName } from '../../../../../features/highlighter/callout-presets/display-name';
import { CalloutPresetPreview } from '../../../../../ui/highlighter-preset-editor/callout/thumbnail';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';
import type { CalloutPresetCatalogController } from './types';
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

type Preset = NonNullable<CalloutPresetCatalogController['catalog']>['presets'][number];

function getConnectorLabel(kind: Preset['style']['connector']['kind']): string {
  if (kind === 'wedge') return translate('highlighter.calloutPresets.connector.wedge');
  if (kind === 'line') return translate('highlighter.calloutPresets.connector.line');
  return translate('highlighter.calloutPresets.connector.none');
}

export function CalloutPresetsPanel({
  controller,
}: {
  controller: CalloutPresetCatalogController;
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
    getDisplayName: (preset) => getCalloutPresetDisplayName(preset, locale),
    getTagIds: (preset) => preset.tagIds,
    query,
    tags: tagState.state.tags,
    values: sourcePresets,
  });
  const enabledCount = sourcePresets.filter((preset) => preset.enabled !== false).length;
  const items: readonly SettingsCollectionItem[] = presets.map((preset) => {
    const isLastEnabled = preset.enabled !== false && enabledCount <= 1;
    return {
      id: preset.id,
      title: getCalloutPresetDisplayName(preset, locale),
      meta: getConnectorLabel(preset.style.connector.kind),
      preview: <CalloutPresetPreview placement={preset.placement} style={preset.style} />,
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
        ...(isLastEnabled ? { toggle: translate('highlighter.calloutPresets.lastEnabled') } : {}),
        ...(preset.enabled === false
          ? { 'set-default': translate('highlighter.calloutPresets.makeDefault') }
          : {}),
      },
    };
  });
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
          enabledDescription: translate('highlighter.calloutPresets.newSession.enabledDescription'),
          enabledLabel: translate('highlighter.calloutPresets.newSession.enabledLabel'),
          frameTemplate: translate('highlighter.calloutPresets.newSession.frameTemplate'),
          primaryTemplate: translate('highlighter.calloutPresets.newSession.primaryTemplate'),
          sourceDescription: translate('highlighter.calloutPresets.newSession.sourceDescription'),
          sourceLabel: translate('highlighter.calloutPresets.newSession.sourceLabel'),
          sectionDescription: translate('highlighter.calloutPresets.newSession.sectionDescription'),
          sectionTitle: translate('highlighter.calloutPresets.newSession.sectionTitle'),
        }}
        defaults={controller.catalog?.newSessionDefaults ?? DEFAULT_ANNOTATION_SESSION_DEFAULTS}
        disabled={controller.isLoading || controller.isSaving || !controller.catalog}
        onEnabledChange={(enabled) => void controller.actions.setNewSessionEnabled(enabled)}
        onTemplateSourceChange={(source) =>
          void controller.actions.setNewSessionTemplateSource(source)
        }
      />
      <SettingsCollection
        ariaLabel={translate('highlighter.calloutPresets.title')}
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
        errorState={translate('highlighter.calloutPresets.messages.loadError')}
        addAction={{
          label: translate('highlighter.calloutPresets.add'),
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
