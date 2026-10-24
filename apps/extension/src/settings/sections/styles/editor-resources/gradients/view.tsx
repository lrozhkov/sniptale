import { projectPresetCollectionFlags, dispatchPresetCollectionAction } from '../preset-collection';
import { movePresetOrder } from '../preset-order';
import { useState } from 'react';
import { DEFAULT_DRAWING_COLORS } from '../../../../../features/drawing/public';
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
    ...projectPresetCollectionFlags(preset),
  }));
  const onAction = (action: SettingsCollectionAction) =>
    dispatchPresetCollectionAction(resources.presets, action, setEditor, resources.actions);
  return (
    <section>
      <SettingsCollection
        addAction={{
          label: translate('settings.editor.gradients.add'),
          onInvoke: () => setEditor('new'),
        }}
        ariaLabel={translate('settings.editor.gradients.title')}
        items={items}
        onAction={onAction}
        onMove={(intent: SettingsCollectionMoveIntent) => {
          const ids = movePresetOrder(resources.presets, intent);
          if (!ids) return;
          return resources.actions.onReorder(ids);
        }}
        state={resources.presets.length > 0 ? 'ready' : 'loading'}
      />
      <GradientPresetEditor
        resources={resources}
        palette={DEFAULT_DRAWING_COLORS}
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
