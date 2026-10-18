import type { ReactNode } from 'react';
import { InspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import '../../../ui/compact-inspector-controls/inspector-surface.css';
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
  ToggleField,
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

/** Render migrated parameter families through the same surface and layout owner as the editor. */
function InspectorPreviewFrame({
  minHeight,
  children,
}: {
  minHeight: number;
  children: ReactNode;
}) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={minHeight} className="justify-start">
      <InspectorLayout>
        <div className="sniptale-compact-workspace sniptale-inspector-surface w-full">
          {children}
        </div>
      </InspectorLayout>
    </DesignSystemFloatingPreviewFrame>
  );
}

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
    <InspectorPreviewFrame minHeight={132}>
      <div className="sniptale-ai-modal-root w-full max-w-[320px]">
        <TextField
          label={translate('designSystem.page.compactInspectorPreviewTitleLabel', locale)}
          value={title}
          readOnly
        />
      </div>
    </InspectorPreviewFrame>
  );
}

function renderSelectFieldPreview(locale: AppLocale) {
  return (
    <InspectorPreviewFrame minHeight={132}>
      <div className="sniptale-ai-modal-root w-full max-w-[320px]">
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
    </InspectorPreviewFrame>
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
    <InspectorPreviewFrame minHeight={172}>
      <div className="sniptale-ai-modal-root w-full max-w-[340px] sniptale-parameter-stack">
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
    </InspectorPreviewFrame>
  );
}

function renderToggleRowsPreview(locale: AppLocale) {
  return (
    <InspectorPreviewFrame minHeight={184}>
      <div className="sniptale-ai-modal-root w-full max-w-[340px] sniptale-parameter-stack">
        <ToggleField
          value
          label={translate('designSystem.page.compactInspectorPreviewDynamicWidth', locale)}
          onChange={() => undefined}
        />
        <ToggleField
          value={false}
          label={translate('designSystem.page.compactInspectorPreviewSmoothing', locale)}
          onChange={() => undefined}
        />
        <ToggleField
          disabled
          label={translate('designSystem.page.compactInspectorPreviewStabilization', locale)}
          value={false}
          onChange={() => undefined}
        />
        <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('designSystem.page.compactInspectorPreviewUnavailable', locale)}
        </p>
      </div>
    </InspectorPreviewFrame>
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
