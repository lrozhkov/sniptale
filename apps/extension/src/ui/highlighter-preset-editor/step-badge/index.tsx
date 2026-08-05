import { useEffect, useRef, useState } from 'react';
import type {
  StepBadgePreset,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { ProductField, ProductInput } from '@sniptale/ui/product-form-controls';
import { CategorizedInspector } from '@sniptale/ui/categorized-inspector';
import { HighlighterManualInspectorSurface } from '../manual-inspector-surface';
import { ContentPopoverSection } from '@sniptale/ui/content-popover-adapter';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  ProductModal,
  ProductModalBody,
  ProductModalFooter,
  ProductModalHeader,
} from '@sniptale/ui/product-modal';
import {
  ProductGlassChip,
  ProductGlassInput,
  ProductGlassRow,
  ProductGlassSectionLabel,
  ProductGlassSwitch,
  ProductGlassToggleRow,
} from '@sniptale/ui/product-glass-controls';
import { Braces, Hash, MapPin, Maximize2, Palette } from 'lucide-react';
import { translate, useAppLocale } from '../../../platform/i18n';
import {
  createStepBadgeSettingsFromTemplate,
  createStepBadgeTemplateFromSettings,
} from '../../../features/highlighter/step-badge-presets/catalog';
import { getStepBadgePresetDisplayName } from '../../../features/highlighter/step-badge-presets/display-name';
import { usePresetEditorModalLifecycle } from '../modal-lifecycle';
import { StepBadgeColorSection, StepBadgeSizeSection } from './inspector';
import { StepBadgeCssSection } from './inspector-css';
import { StepBadgePositionGrid } from './position-grid';
import { StepBadgePresetPreview } from './thumbnail';
import { HighlighterPresetPropertyField as PropertyField } from '../inspector-field';

type StepBadgePresetEditorProps = {
  isNew?: boolean;
  isOpen: boolean;
  isSaving: boolean;
  preset: StepBadgePreset;
  onClose: () => void;
  onReset?: (() => void | Promise<void>) | undefined;
  onSave: (preset: StepBadgePreset) => void | Promise<void>;
};

type PresetEditorSection = 'numbering' | 'position' | 'size' | 'colors' | 'css';

const PREVIEW_FRAME = {
  borderColor: '#f97316',
  borderWidth: 4,
  fillColor: '#fff7ed',
  fillOpacity: 0.16,
};

function StepBadgePresetSettingsInspector(props: {
  onPatch: (value: Partial<StepBadgeSettings>) => void;
  settings: StepBadgeSettings;
}) {
  const sections = [
    { icon: Hash, id: 'numbering', label: translate('content.stepBadge.numberingSection') },
    { icon: MapPin, id: 'position', label: translate('content.stepBadge.positionSection') },
    { icon: Maximize2, id: 'size', label: translate('content.stepBadge.sizeSection') },
    { icon: Palette, id: 'colors', label: translate('content.stepBadge.colorsSection') },
    { icon: Braces, id: 'css', label: translate('content.stepBadge.cssSection') },
  ] as const;
  const renderSection = (section: PresetEditorSection) => {
    if (section === 'numbering') {
      return <StepBadgePresetNumberingSection {...props} />;
    }
    if (section === 'position') {
      return (
        <StepBadgePositionGrid
          anchor={props.settings.anchor ?? 'top-left'}
          offsets={props.settings.offsetDirections ?? []}
          onAnchorChange={(anchor) => props.onPatch({ anchor })}
          onOffsetToggle={(direction) =>
            props.onPatch({
              offsetDirections: toggleOffset(props.settings.offsetDirections ?? [], direction),
            })
          }
        />
      );
    }
    if (section === 'size') {
      return (
        <StepBadgeSizeSection
          embedded
          frame={PREVIEW_FRAME}
          onChange={props.onPatch}
          settings={props.settings}
        />
      );
    }
    if (section === 'colors') {
      return (
        <StepBadgeColorSection
          embedded
          frame={PREVIEW_FRAME}
          onChange={props.onPatch}
          settings={props.settings}
        />
      );
    }
    return <StepBadgeCssSection onChange={props.onPatch} settings={props.settings} />;
  };

  return (
    <ContentPopoverSection className="!p-0 overflow-hidden">
      <HighlighterManualInspectorSurface>
        <CategorizedInspector
          ariaLabel={translate('content.stepBadge.manualNavigation')}
          dataUi="shared.step-badge-preset-editor.inspector"
          initialSection="numbering"
          renderSection={renderSection}
          sections={sections}
          showSectionHeading
        />
      </HighlighterManualInspectorSurface>
    </ContentPopoverSection>
  );
}

function StepBadgePresetNumberingSection(props: {
  onPatch: (value: Partial<StepBadgeSettings>) => void;
  settings: StepBadgeSettings;
}) {
  const isAuto = props.settings.auto !== false;
  return (
    <div className="grid gap-3">
      <ProductGlassToggleRow
        title={translate('content.stepBadge.autoTitle')}
        hint={translate('content.stepBadge.autoHint')}
        control={
          <ProductGlassSwitch on={isAuto} onClick={() => props.onPatch({ auto: !isAuto })} />
        }
      />
      {isAuto ? (
        <>
          <div className="sniptale-step-badge-group">
            <ProductGlassSectionLabel>
              {translate('content.stepBadge.typeLabel')}
            </ProductGlassSectionLabel>
            <ProductGlassRow>
              {(['number', 'letter'] as const).map((type) => (
                <ProductGlassChip
                  active={props.settings.type === type}
                  className="sniptale-step-badge-chip"
                  key={type}
                  onClick={() => props.onPatch({ type })}
                >
                  {translate(
                    type === 'number'
                      ? 'content.stepBadge.typeNumber'
                      : 'content.stepBadge.typeLetter'
                  )}
                </ProductGlassChip>
              ))}
            </ProductGlassRow>
          </div>
          {props.settings.type === 'letter' ? (
            <div className="sniptale-step-badge-group">
              <ProductGlassSectionLabel>
                {translate('content.stepBadge.alphabetLabel')}
              </ProductGlassSectionLabel>
              <ProductGlassRow>
                {(['cyrillic', 'latin'] as const).map((alphabet) => (
                  <ProductGlassChip
                    active={props.settings.alphabet === alphabet}
                    className="sniptale-step-badge-chip"
                    key={alphabet}
                    onClick={() => props.onPatch({ alphabet })}
                  >
                    {translate(
                      alphabet === 'cyrillic'
                        ? 'content.stepBadge.alphabetCyrillic'
                        : 'content.stepBadge.alphabetLatin'
                    )}
                  </ProductGlassChip>
                ))}
              </ProductGlassRow>
            </div>
          ) : null}
        </>
      ) : (
        <PropertyField label={translate('content.stepBadge.valueSection')}>
          <ProductGlassRow>
            <ProductGlassInput
              aria-label={translate('content.stepBadge.valueSection')}
              className="sniptale-step-badge-input"
              maxLength={2}
              onChange={(event) => props.onPatch({ value: event.currentTarget.value })}
              type="text"
              value={props.settings.value}
            />
          </ProductGlassRow>
        </PropertyField>
      )}
    </div>
  );
}

function PresetEditorBody(props: {
  name: string;
  onPatch: (value: Partial<StepBadgeSettings>) => void;
  settings: StepBadgeSettings;
  setName: (value: string) => void;
}) {
  const template = createStepBadgeTemplateFromSettings(props.settings, 29.16);
  return (
    <ProductModalBody compact className="space-y-4">
      <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-4">
        <StepBadgePresetPreview settings={template} />
        <ProductField label={translate('highlighter.stepBadgePresets.editor.name')}>
          <ProductInput
            className="cursor-text"
            maxLength={64}
            style={{ cursor: 'text' }}
            value={props.name}
            onChange={(event) => props.setName(event.target.value)}
          />
        </ProductField>
      </div>
      <StepBadgePresetSettingsInspector onPatch={props.onPatch} settings={props.settings} />
    </ProductModalBody>
  );
}

function PresetEditorFooter(props: {
  isSaving: boolean;
  name: string;
  onClose: () => void;
  onReset?: (() => void | Promise<void>) | undefined;
  onSave: () => void;
}) {
  return (
    <ProductModalFooter compact>
      {props.onReset ? (
        <ProductActionButton
          tone="secondary"
          disabled={props.isSaving}
          onClick={() => void props.onReset?.()}
        >
          {translate('highlighter.stepBadgePresets.reset')}
        </ProductActionButton>
      ) : null}
      <ProductActionButton tone="secondary" onClick={props.onClose}>
        {translate('common.actions.cancel')}
      </ProductActionButton>
      <ProductActionButton
        tone="primary"
        disabled={!props.name.trim() || props.isSaving}
        onClick={props.onSave}
      >
        {translate('common.actions.save')}
      </ProductActionButton>
    </ProductModalFooter>
  );
}

export function StepBadgePresetEditor(props: StepBadgePresetEditorProps) {
  const locale = useAppLocale();
  const modalRootRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<StepBadgeSettings | null>(null);

  useEffect(() => {
    if (!props.isOpen) return;
    setName(props.isNew ? '' : getStepBadgePresetDisplayName(props.preset, locale));
    setSettings(createStepBadgeSettingsFromTemplate(props.preset.settings, props.preset.id));
  }, [locale, props.isNew, props.isOpen, props.preset]);

  usePresetEditorModalLifecycle({
    isOpen: props.isOpen && settings !== null,
    modalRootRef,
    onClose: props.onClose,
  });

  if (!props.isOpen || !settings) return null;
  const template = createStepBadgeTemplateFromSettings(settings, 29.16);
  const patch = (value: Partial<StepBadgeSettings>) =>
    setSettings((current) =>
      current
        ? { ...current, ...value, ...(value.style ? { style: { ...value.style } } : {}) }
        : current
    );
  const save = () =>
    void props.onSave({
      ...props.preset,
      ...(props.isNew ? { id: '', origin: 'user' as const } : {}),
      name: name.trim(),
      settings: template,
    });

  return (
    <div ref={modalRootRef} style={{ display: 'contents' }}>
      <ProductModal
        isOpen
        width="400px"
        maxWidth="94vw"
        maxHeight="88vh"
        scrollable
        onClose={props.onClose}
      >
        <ProductModalHeader
          compact
          title={translate(
            props.isNew
              ? 'highlighter.stepBadgePresets.editor.newTitle'
              : 'highlighter.stepBadgePresets.editor.editTitle'
          )}
          onClose={props.onClose}
        />
        <PresetEditorBody name={name} onPatch={patch} settings={settings} setName={setName} />
        <PresetEditorFooter
          isSaving={props.isSaving}
          name={name}
          onClose={props.onClose}
          {...(props.onReset ? { onReset: props.onReset } : {})}
          onSave={save}
        />
      </ProductModal>
    </div>
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
