import { useEffect, useState } from 'react';
import type {
  StepBadgePreset,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ProductField, ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import { ProductGlassSwitch, ProductGlassToggleRow } from '@sniptale/ui/product-glass-controls';
import { translate, useAppLocale } from '../../../../platform/i18n';
import {
  createStepBadgeSettingsFromTemplate,
  createStepBadgeTemplateFromSettings,
} from '../../../../features/highlighter/step-badge-presets/catalog';
import { StepBadgePresetPreview } from '../../../../ui/highlighter-preset-editor/step-badge/thumbnail';
import { StepBadgeAppearanceSection } from '../../../../ui/highlighter-preset-editor/step-badge/inspector';
import { StepBadgePositionGrid } from '../../../../ui/highlighter-preset-editor/step-badge/position-grid';
import type { StepBadgePresetCatalogController } from './types';
import { getStepBadgePresetDisplayName } from '../../../../features/highlighter/step-badge-presets/display-name';

export function StepBadgePresetEditor({
  controller,
}: {
  controller: StepBadgePresetCatalogController;
}) {
  const locale = useAppLocale();
  const source =
    controller.editor.preset ??
    controller.catalog?.presets.find((preset) => preset.id === controller.catalog?.defaultPresetId);
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<StepBadgeSettings | null>(null);
  useEffect(() => {
    if (!controller.editor.isOpen || !source) return;
    setName(controller.editor.preset ? getStepBadgePresetDisplayName(source, locale) : '');
    setSettings(createStepBadgeSettingsFromTemplate(source.settings, source.id));
  }, [controller.editor.isOpen, controller.editor.preset, locale, source]);
  if (!controller.editor.isOpen || !source || !settings) return null;
  const template = createStepBadgeTemplateFromSettings(settings, 29.16);
  const save = () => {
    const preset: StepBadgePreset = controller.editor.preset
      ? { ...controller.editor.preset, name: name.trim(), settings: template }
      : {
          id: '',
          name: name.trim(),
          enabled: true,
          order: controller.catalog?.presets.length ?? 0,
          origin: 'user',
          settings: template,
        };
    void controller.actions.save(preset);
  };
  const patch = (value: Partial<StepBadgeSettings>) =>
    setSettings((current) =>
      current
        ? { ...current, ...value, ...(value.style ? { style: { ...value.style } } : {}) }
        : current
    );
  return (
    <ProductModal
      isOpen
      width="420px"
      maxWidth="94vw"
      maxHeight="88vh"
      scrollable
      onClose={controller.actions.closeEditor}
    >
      <ProductModalHeader
        compact
        title={translate(
          controller.editor.preset
            ? 'highlighter.stepBadgePresets.editor.editTitle'
            : 'highlighter.stepBadgePresets.editor.newTitle'
        )}
      />
      <ProductModalBody compact className="space-y-4">
        <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-4">
          <StepBadgePresetPreview settings={template} />
          <ProductField label={translate('highlighter.stepBadgePresets.editor.name')}>
            <ProductInput
              maxLength={64}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </ProductField>
        </div>
        <StepBadgePositionGrid
          anchor={settings.anchor ?? 'top-left'}
          offsets={settings.offsetDirections ?? []}
          onAnchorChange={(anchor) => patch({ anchor })}
          onOffsetToggle={(direction) =>
            patch({
              offsetDirections: toggleOffset(settings.offsetDirections ?? [], direction),
            })
          }
        />
        <ProductGlassToggleRow
          title={translate('content.stepBadge.autoTitle')}
          hint={translate('content.stepBadge.autoHint')}
          control={
            <ProductGlassSwitch
              on={settings.auto !== false}
              onClick={() => patch({ auto: settings.auto === false })}
            />
          }
        />
        <ProductField label={translate('content.stepBadge.valueSection')}>
          <ProductInput
            maxLength={2}
            disabled={settings.auto !== false}
            value={settings.value}
            onChange={(event) => patch({ value: event.target.value.slice(0, 2) })}
          />
        </ProductField>
        <StepBadgeAppearanceSection
          frame={{
            borderColor: '#f97316',
            borderWidth: 4,
            fillColor: '#fff7ed',
            fillOpacity: 0.16,
          }}
          onChange={patch}
          settings={settings}
        />
      </ProductModalBody>
      <ProductModalFooter compact>
        <ProductActionButton tone="secondary" onClick={controller.actions.closeEditor}>
          {translate('common.actions.cancel')}
        </ProductActionButton>
        <ProductActionButton
          tone="primary"
          disabled={!name.trim() || controller.isSaving}
          onClick={save}
        >
          {translate('common.actions.save')}
        </ProductActionButton>
      </ProductModalFooter>
    </ProductModal>
  );
}

function toggleOffset(
  offsets: NonNullable<StepBadgeSettings['offsetDirections']>,
  direction: NonNullable<StepBadgeSettings['offsetDirections']>[number]
) {
  return offsets.includes(direction)
    ? offsets.filter((item) => item !== direction)
    : [...offsets, direction];
}
