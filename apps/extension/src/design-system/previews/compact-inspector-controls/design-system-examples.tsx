import { translate, type AppLocale } from '../../../platform/i18n';
import { DesignSystemFloatingPreviewFrame } from '../support/provider';
import {
  CompactColorOption,
  ColorField,
  InspectorPanel,
  NumericRow,
  PanelHeader,
  PresetList,
} from '../../../ui/compact-inspector-controls/index';

export function renderReferencePanelPreview(locale: AppLocale) {
  const lineSection = translate('designSystem.page.compactInspectorPreviewLineSection', locale);
  const strokeColorSection = translate(
    'designSystem.page.compactInspectorPreviewStrokeColorSection',
    locale
  );
  return (
    <DesignSystemFloatingPreviewFrame minHeight={260} className="justify-start">
      <div className="sniptale-ai-modal-root sniptale-theme-dark w-full max-w-[320px] rounded-[16px] p-3">
        <InspectorPanel className="space-y-4 bg-[color:var(--sniptale-color-surface-panel)]">
          <div className="space-y-2">
            <PanelHeader>{lineSection}</PanelHeader>
            <NumericRow
              label={translate('designSystem.page.compactInspectorPreviewStrokeWidth', locale)}
              value={8}
              unit="px"
              min={0}
              max={48}
              onPreviewValue={() => undefined}
              onCommitValue={() => undefined}
              scrub={{ min: 0, max: 48, step: 1 }}
            />
          </div>
          <div className="space-y-2">
            <PanelHeader>{strokeColorSection}</PanelHeader>
            <ColorField
              label={translate('designSystem.page.compactInspectorPreviewStrokeColor', locale)}
              title={translate('designSystem.page.compactInspectorPreviewStrokeColor', locale)}
              value="#F8FAFC"
              onChange={() => undefined}
            />
            <NumericRow
              label={translate('designSystem.page.compactInspectorPreviewOpacity', locale)}
              value={100}
              unit="%"
              min={0}
              max={100}
              onPreviewValue={() => undefined}
              onCommitValue={() => undefined}
              scrub={{ min: 0, max: 100, step: 1 }}
            />
          </div>
        </InspectorPanel>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

export function renderPresetListPreview(locale: AppLocale) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={220} className="justify-start">
      <div className="sniptale-ai-modal-root w-full max-w-[340px]">
        <PresetList
          emptyLabel={translate('designSystem.page.compactInspectorPreviewEmptyTemplates', locale)}
          groups={[
            {
              id: 'system',
              label: translate('designSystem.page.compactInspectorPreviewSystemGroup', locale),
              templates: [
                {
                  id: 'line',
                  label: translate('designSystem.page.compactInspectorPreviewThinLine', locale),
                  selected: true,
                  onApply: () => undefined,
                },
              ],
            },
            {
              id: 'user',
              label: translate('designSystem.page.compactInspectorPreviewUserGroup', locale),
              templates: [
                {
                  id: 'accent',
                  label: translate('designSystem.page.compactInspectorPreviewAccent', locale),
                  onApply: () => undefined,
                },
              ],
            },
          ]}
        />
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

export function renderCompactColorOptionPreview(locale: AppLocale) {
  const warmAccent = translate('designSystem.page.compactInspectorPreviewWarmAccent', locale);
  const deepBlue = translate('designSystem.page.compactInspectorPreviewDeepBlue', locale);
  return (
    <DesignSystemFloatingPreviewFrame minHeight={124} className="justify-start">
      <div className="sniptale-ai-modal-root flex w-full max-w-[320px] items-center gap-3">
        <CompactColorOption
          aria-label={warmAccent}
          title={warmAccent}
          style={{ backgroundColor: '#f97316' }}
        />
        <CompactColorOption
          aria-label={deepBlue}
          title={deepBlue}
          active
          style={{ backgroundColor: '#2563eb' }}
        />
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}
