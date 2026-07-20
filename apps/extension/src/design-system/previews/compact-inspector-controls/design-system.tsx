import { translate, type AppLocale } from '../../../platform/i18n';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';
import {
  CompactInput,
  CompactRange,
  CompactSelect,
  NumericRow,
  OptionRow,
  PanelHeader,
  SelectField,
  TextField,
} from '../../../ui/compact-inspector-controls/index';
import {
  renderCompactColorOptionPreview,
  renderPresetListPreview,
  renderReferencePanelPreview,
} from './design-system-examples';
import { renderToggleGridPreview } from './toggle-grid.preview.tsx';

function renderCompactInputPreview(locale: AppLocale) {
  const title = translate('designSystem.page.compactInspectorPreviewSceneTitle', locale);
  return (
    <DesignSystemFloatingPreviewFrame minHeight={128} className="justify-start">
      <div className="sniptale-ai-modal-root w-full max-w-[320px]">
        <CompactInput value={title} readOnly aria-label={title} />
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderCompactSelectPreview(locale: AppLocale) {
  const themeLabel = translate('designSystem.page.compactInspectorPreviewTheme', locale);
  return (
    <DesignSystemFloatingPreviewFrame minHeight={132} className="justify-start">
      <div className="sniptale-ai-modal-root w-full max-w-[320px]">
        <CompactSelect
          aria-label={themeLabel}
          value="dark"
          onChange={() => undefined}
          options={[
            {
              value: 'light',
              label: translate('designSystem.page.compactInspectorPreviewThemeLight', locale),
            },
            {
              value: 'dark',
              label: translate('designSystem.page.compactInspectorPreviewThemeDark', locale),
            },
          ]}
        />
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderTextFieldPreview(locale: AppLocale) {
  const title = translate('designSystem.page.compactInspectorPreviewSceneTitle', locale);
  return (
    <DesignSystemFloatingPreviewFrame minHeight={132} className="justify-start">
      <div className="sniptale-ai-modal-root sniptale-theme-dark w-full max-w-[320px]">
        <TextField
          label={translate('designSystem.page.compactInspectorPreviewTitleLabel', locale)}
          value={title}
          readOnly
        />
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderSelectFieldPreview(locale: AppLocale) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={132} className="justify-start">
      <div className="sniptale-ai-modal-root sniptale-theme-dark w-full max-w-[320px]">
        <SelectField
          label={translate('designSystem.page.compactInspectorPreviewStyleLabel', locale)}
          value="dash"
          onChange={() => undefined}
          options={[
            {
              value: 'solid',
              label: translate('designSystem.page.compactInspectorPreviewSolid', locale),
            },
            {
              value: 'dash',
              label: translate('designSystem.page.compactInspectorPreviewDash', locale),
            },
          ]}
        />
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderCompactRangePreview(locale: AppLocale) {
  const label = translate('designSystem.page.compactInspectorPreviewScale', locale);
  return (
    <DesignSystemFloatingPreviewFrame minHeight={124} className="justify-start">
      <div className="sniptale-ai-modal-root flex w-full max-w-[360px] items-center gap-4">
        <CompactRange defaultValue={48} aria-label={label} />
        <span className="text-xs text-[var(--sniptale-color-text-dim)]">48%</span>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderPanelHeaderPreview(locale: AppLocale) {
  const header = translate('designSystem.page.compactInspectorPreviewInputAndSelection', locale);
  return (
    <DesignSystemFloatingPreviewFrame minHeight={112} className="justify-start">
      <div className="sniptale-ai-modal-root w-full max-w-[320px]">
        <PanelHeader>{header}</PanelHeader>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderNumericRowPreview(locale: AppLocale) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={172} className="justify-start">
      <div className="sniptale-ai-modal-root w-full max-w-[340px] space-y-2">
        <NumericRow
          label={translate('designSystem.page.compactInspectorPreviewSize', locale)}
          value={64}
          unit="px"
          min={0}
          max={120}
          onPreviewValue={() => undefined}
          onCommitValue={() => undefined}
          scrub={{ min: 0, max: 120 }}
        />
        <NumericRow
          label={translate('designSystem.page.compactInspectorPreviewOpacity', locale)}
          value={90}
          unit="%"
          min={0}
          max={100}
          disabled
          onPreviewValue={() => undefined}
          onCommitValue={() => undefined}
        />
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderToggleRowsPreview(locale: AppLocale) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={184} className="justify-start">
      <div className="sniptale-ai-modal-root w-full max-w-[340px] space-y-2">
        <OptionRow
          active
          label={translate('designSystem.page.compactInspectorPreviewDynamicWidth', locale)}
          onToggle={() => undefined}
        />
        <OptionRow
          label={translate('designSystem.page.compactInspectorPreviewSmoothing', locale)}
          onToggle={() => undefined}
        />
        <OptionRow
          disabled
          label={translate('designSystem.page.compactInspectorPreviewStabilization', locale)}
          value={translate('designSystem.page.compactInspectorPreviewUnavailable', locale)}
        />
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

const COMPACT_INSPECTOR_PREVIEW_FACTORIES = [
  ['input', renderCompactInputPreview],
  ['text-field', renderTextFieldPreview],
  ['select', renderCompactSelectPreview],
  ['select-field', renderSelectFieldPreview],
  ['range', renderCompactRangePreview],
  ['panel-header', renderPanelHeaderPreview],
  ['numeric-row', renderNumericRowPreview],
  ['toggle-row', renderToggleRowsPreview],
  ['toggle-grid', renderToggleGridPreview],
  ['preset-list', renderPresetListPreview],
  ['reference-panel', renderReferencePanelPreview],
  ['color-option', renderCompactColorOptionPreview],
] as const;

export function buildCompactInspectorControlsSharedPreviews(
  locale: AppLocale
): DesignSystemVariantPreview[] {
  return COMPACT_INSPECTOR_PREVIEW_FACTORIES.map(([variant, renderPreview]) =>
    designSystemPreview('shared.ui.compact-inspector-controls', variant, renderPreview(locale))
  );
}
