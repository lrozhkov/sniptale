import { translate } from '../../../../platform/i18n';
import type { TranslationKey } from '../../../../platform/i18n/types';
import { cx } from '../../../chrome/ui';
import type {
  ShapeBrowserImportDiagnosticCode,
  ShapeBrowserImportState,
  ShapeBrowserImportSummary,
} from './types';

const DIAGNOSTIC_LABEL_KEYS = {
  'empty-file': 'editor.shapeCatalog.browser.diagnostic.emptyFile',
  'invalid-excalidraw': 'editor.shapeCatalog.browser.diagnostic.invalidExcalidraw',
  'invalid-json': 'editor.shapeCatalog.browser.diagnostic.invalidJson',
  'invalid-svg': 'editor.shapeCatalog.browser.diagnostic.invalidSvg',
  'resource-budget': 'editor.shapeCatalog.browser.diagnostic.resourceBudget',
  'unsafe-svg': 'editor.shapeCatalog.browser.diagnostic.unsafeSvg',
  'unsupported-element': 'editor.shapeCatalog.browser.diagnostic.unsupportedElement',
  'unsupported-geometry': 'editor.shapeCatalog.browser.diagnostic.unsupportedGeometry',
  'skipped-element': 'editor.shapeCatalog.browser.diagnostic.skippedElement',
} satisfies Record<ShapeBrowserImportDiagnosticCode, TranslationKey>;

function SummaryCount(props: { labelKey: TranslationKey; value: number }) {
  return (
    <span className="rounded-[6px] bg-[color:var(--sniptale-color-surface-input)] px-2 py-1">
      {translate(props.labelKey)}: <strong>{props.value}</strong>
    </span>
  );
}

function SummarySource(props: { summary: ShapeBrowserImportSummary }) {
  return (
    <div className="mt-2 space-y-1 text-[color:var(--sniptale-color-text-secondary)]">
      <div>
        {translate('editor.shapeCatalog.browser.sourceFileLabel')}: {props.summary.sourceFileName}
      </div>
      {props.summary.libraryName ? (
        <div>
          {translate('editor.shapeCatalog.browser.libraryNameLabel')}: {props.summary.libraryName}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCounts(props: { summary: ShapeBrowserImportSummary }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1 text-[color:var(--sniptale-color-text-secondary)]">
      <SummaryCount
        labelKey="editor.shapeCatalog.browser.importedCount"
        value={props.summary.importedCount}
      />
      <SummaryCount
        labelKey="editor.shapeCatalog.browser.skippedCount"
        value={props.summary.skippedCount}
      />
      <SummaryCount
        labelKey="editor.shapeCatalog.browser.unsupportedCount"
        value={props.summary.unsupportedCount}
      />
      <SummaryCount
        labelKey="editor.shapeCatalog.browser.validationErrorsCount"
        value={props.summary.validationErrorCount}
      />
    </div>
  );
}

function SummaryDiagnosticList(props: { summary: ShapeBrowserImportSummary }) {
  if (props.summary.diagnostics.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 space-y-1 text-[color:var(--sniptale-color-text-secondary)]">
      {props.summary.diagnostics.map((diagnostic, index) => (
        <li key={`${diagnostic.code}-${index}`}>
          {translate(
            diagnostic.severity === 'error'
              ? 'editor.shapeCatalog.browser.diagnosticError'
              : 'editor.shapeCatalog.browser.diagnosticWarning'
          )}
          : {translate(DIAGNOSTIC_LABEL_KEYS[diagnostic.code])}
        </li>
      ))}
    </ul>
  );
}

function SummaryBody(props: { summary?: ShapeBrowserImportSummary }) {
  if (!props.summary) {
    return null;
  }

  return (
    <>
      <SummarySource summary={props.summary} />
      <SummaryCounts summary={props.summary} />
      <SummaryDiagnosticList summary={props.summary} />
    </>
  );
}

export function ImportDiagnostics(props: { state?: ShapeBrowserImportState }) {
  const summary = props.state?.summary;
  if (!summary && !props.state?.message) {
    return null;
  }

  const error = props.state?.status === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={cx(
        'rounded-[8px] border p-3 text-xs leading-5',
        error
          ? 'border-[color:var(--sniptale-color-danger)]'
          : 'border-[color:var(--sniptale-color-border-soft)]'
      )}
    >
      <div className="font-semibold text-[color:var(--sniptale-color-text-primary)]">
        {translate(
          error
            ? 'editor.shapeCatalog.browser.importErrorTitle'
            : 'editor.shapeCatalog.browser.importDiagnosticsTitle'
        )}
      </div>
      <SummaryBody {...(summary ? { summary } : {})} />
      {props.state?.message ? (
        <p className="mt-1 text-[color:var(--sniptale-color-text-secondary)]">
          {props.state.message}
        </p>
      ) : null}
    </div>
  );
}
