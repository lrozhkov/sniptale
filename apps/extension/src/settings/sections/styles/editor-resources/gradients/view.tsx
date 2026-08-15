import { useState } from 'react';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import { translate } from '../../../../../platform/i18n';
import { useGradientPresetCatalog } from '../../../../../composition/gradient-preset-resources/use-gradient-preset-catalog';
import type { StoredGradientPreset } from '../../../../../composition/persistence/gradient-presets';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';
import { GradientPresetEditor } from './editor';

export function GradientPresetsSettings() {
  const resources = useGradientPresetCatalog('highlighter-frame-fill');
  const [editor, setEditor] = useState<StoredGradientPreset | 'new' | null>(null);
  const items: readonly SettingsCollectionItem[] = resources.presets.map((preset) => ({
    id: preset.id,
    title: preset.name,
    meta: translate(`settings.editor.gradients.types.${preset.gradient.type}` as const),
    preview: (
      <span
        className="h-full w-full"
        style={{
          backgroundImage: serializePaintToCss({ kind: 'gradient', gradient: preset.gradient }),
        }}
      />
    ),
    enabled: preset.enabled,
    isBuiltIn: preset.origin === 'system',
    isDefault: preset.isDefault,
    ...(preset.customized
      ? {
          badges: [
            {
              id: 'customized',
              label: translate('settings.editor.customizedBadge'),
              tone: 'warning' as const,
            },
          ],
        }
      : {}),
    capabilities: {
      delete: preset.origin === 'user',
      edit: true,
      reorder: true,
      reset: preset.origin === 'system' && preset.customized,
      setDefault: !preset.isDefault,
      toggle: true,
    },
    disabledActions: {
      ...(preset.isDefault ? { toggle: translate('settings.editor.defaultCannotDisable') } : {}),
      ...(preset.isDefault && preset.origin === 'user'
        ? { delete: translate('settings.editor.defaultCannotDelete') }
        : {}),
      ...(!preset.enabled
        ? { 'set-default': translate('settings.editor.disabledCannotBeDefault') }
        : {}),
    },
  }));
  const byId = new Map(resources.presets.map((preset) => [preset.id, preset]));
  const onAction = (action: SettingsCollectionAction) => {
    const preset = byId.get(action.itemId);
    if (!preset) return;
    if (action.type === 'edit') setEditor(preset);
    if (action.type === 'toggle') void resources.actions.onToggleEnabled(preset.id);
    if (action.type === 'set-default') void resources.actions.onSetDefault(preset.id);
    if (action.type === 'reset') void resources.actions.onResetPreset(preset.id);
    if (action.type === 'delete') void resources.actions.onDelete(preset.id);
  };
  return (
    <section className="mt-8">
      <SettingsCollection
        addAction={{
          label: translate('settings.editor.gradients.add'),
          onInvoke: () => setEditor('new'),
        }}
        ariaLabel={translate('settings.editor.gradients.title')}
        description={translate('settings.editor.gradients.description')}
        items={items}
        onAction={onAction}
        onMove={(intent: SettingsCollectionMoveIntent) => {
          const ids = resources.presets.map((preset) => preset.id);
          const from = ids.indexOf(intent.itemId);
          if (from < 0) return;
          ids.splice(from, 1);
          const to = intent.beforeItemId === null ? ids.length : ids.indexOf(intent.beforeItemId);
          if (to < 0) return;
          ids.splice(to, 0, intent.itemId);
          void resources.actions.onReorder(ids);
        }}
        state={resources.presets.length > 0 ? 'ready' : 'loading'}
        title={translate('settings.editor.gradients.title')}
      />
      <GradientPresetEditor
        onClose={() => setEditor(null)}
        onSave={(name, gradient) =>
          editor === 'new'
            ? resources.actions.onSave(name, gradient)
            : resources.actions.onEdit(editor!.id, name, gradient)
        }
        open={editor !== null}
        preset={editor === 'new' ? null : editor}
      />
    </section>
  );
}
