import { useState } from 'react';
import { serializePaintToCss } from '@sniptale/foundation/paint';
import { translate } from '../../../../../platform/i18n';
import { projectCanonicalSurfaceCss } from '../../../../../features/highlighter/surface-style/surface-css';
import { useSurfaceStylePresetCatalog } from '../../../../../composition/surface-style-preset-resources/use-surface-style-preset-catalog';
import type { ManagedSurfaceStylePreset } from '../../../../../composition/persistence/surface-style-presets';
import {
  SettingsCollection,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
  type SettingsCollectionMoveIntent,
} from '../../../../section-surface';
import { SurfaceStylePresetEditor } from './editor';

export function SurfaceStylePresetsSettings() {
  const resources = useSurfaceStylePresetCatalog();
  const [editor, setEditor] = useState<ManagedSurfaceStylePreset | 'new' | null>(null);
  const catalog = resources.catalog;
  const presets = resources.presets;
  const items: readonly SettingsCollectionItem[] = presets.map((preset) => ({
    id: preset.id,
    title: preset.name,
    meta: preset.style.surfaceCss
      ? translate('settings.editor.surfaceStyles.cssEnabled')
      : translate('settings.editor.surfaceStyles.paintOnly'),
    preview: (
      <span
        className="h-full w-full"
        style={{
          background: serializePaintToCss(preset.style.fillPaint),
          ...(projectCanonicalSurfaceCss(preset.style.surfaceCss) ?? {}),
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
  const byId = new Map(presets.map((preset) => [preset.id, preset]));
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
          label: translate('settings.editor.surfaceStyles.add'),
          onInvoke: () => setEditor('new'),
        }}
        ariaLabel={translate('settings.editor.surfaceStyles.title')}
        description={translate('settings.editor.surfaceStyles.description')}
        items={items}
        onAction={onAction}
        onMove={(intent: SettingsCollectionMoveIntent) => {
          const ids = presets.map((preset) => preset.id);
          const from = ids.indexOf(intent.itemId);
          if (from < 0) return;
          ids.splice(from, 1);
          const to = intent.beforeItemId === null ? ids.length : ids.indexOf(intent.beforeItemId);
          if (to < 0) return;
          ids.splice(to, 0, intent.itemId);
          void resources.actions.onReorderAll(ids);
        }}
        state={catalog ? 'ready' : 'loading'}
        title={translate('settings.editor.surfaceStyles.title')}
      />
      <SurfaceStylePresetEditor
        onClose={() => setEditor(null)}
        onSave={(name, style) =>
          editor === 'new'
            ? resources.actions.onCreate(name, style)
            : resources.actions.onEdit(editor!.id, name, style)
        }
        open={editor !== null}
        preset={editor === 'new' ? null : editor}
      />
    </section>
  );
}
