import { projectPresetCollectionFlags, dispatchPresetCollectionAction } from '../preset-collection';
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
    ...projectPresetCollectionFlags(preset),
  }));
  const onAction = (action: SettingsCollectionAction) =>
    dispatchPresetCollectionAction(presets, action, setEditor, resources.actions);
  return (
    <section>
      <SettingsCollection
        addAction={{
          label: translate('settings.editor.surfaceStyles.add'),
          onInvoke: () => setEditor('new'),
        }}
        ariaLabel={translate('settings.editor.surfaceStyles.title')}
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
          return resources.actions.onReorderAll(ids);
        }}
        state={catalog ? 'ready' : 'loading'}
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
