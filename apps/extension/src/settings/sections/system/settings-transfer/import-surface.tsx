import { useMemo, useState, type RefObject } from 'react';
import { writeBrowserClipboardText } from '@sniptale/platform/browser/clipboard';
import { ProductSelect } from '@sniptale/ui/product-form-controls';
import type {
  SettingsTransferCommitReport,
  SettingsTransferConflictDecision,
  SettingsTransferInspection,
  SettingsTransferStrategy,
  SettingsTransferTreeNode,
} from '../../../../contracts/settings-transfer';
import { translate } from '../../../../platform/i18n';
import { settingsAddButtonClassName, settingsPanelClassName } from '../../../section-surface';
import { SettingsTransferTree } from './tree';
import { buildVisibleSettingsTransferConflicts } from './conflict-view';
import { downloadSettingsTransferText } from './ui-helpers';

export function ImportFilePicker(props: {
  inputRef: RefObject<HTMLInputElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  disabled: boolean;
  onFile: (file: File) => Promise<void>;
}) {
  const acceptFile = (file?: File) => {
    if (file) void props.onFile(file);
  };
  return (
    <div
      className="mt-4 rounded-xl border border-dashed border-[var(--sniptale-color-border-strong)] p-6 text-center"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (props.disabled) return;
        acceptFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={props.inputRef}
        className="sr-only"
        type="file"
        disabled={props.disabled}
        accept=".json,.sniptale-settings.json"
        onChange={(event) => acceptFile(event.currentTarget.files?.[0])}
      />
      <p className="text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('settings.settingsTransfer.dropFile')}
      </p>
      <button
        ref={props.buttonRef}
        className={`${settingsAddButtonClassName} mt-3`}
        disabled={props.disabled}
        onClick={() => props.inputRef.current?.click()}
      >
        {translate('settings.settingsTransfer.chooseFile')}
      </button>
    </div>
  );
}

type ImportReviewProps = {
  inspection: SettingsTransferInspection;
  selected: Set<string>;
  strategy: SettingsTransferStrategy;
  decisions: Record<string, SettingsTransferConflictDecision>;
  confirmed: boolean;
  busy: boolean;
  onToggle: (node: SettingsTransferTreeNode, checked: boolean) => void;
  onBulkToggle: (nodes: readonly SettingsTransferTreeNode[], checked: boolean) => void;
  onStrategyChange: (strategy: SettingsTransferStrategy) => void;
  onDecisionChange: (id: string, decision: SettingsTransferConflictDecision) => void;
  onConfirmedChange: (confirmed: boolean) => void;
  onCommit: () => void;
};

export function ImportReview(props: ImportReviewProps) {
  const destructiveBlocked = props.strategy === 'exact-restore' && !props.confirmed;
  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm">{translate('settings.settingsTransfer.compatibleFile')}</p>
      <SettingsTransferTree
        nodes={props.inspection.tree}
        selected={props.selected}
        onToggle={props.onToggle}
        onBulkToggle={props.onBulkToggle}
      />
      <ImportStrategy
        inspection={props.inspection}
        strategy={props.strategy}
        onChange={props.onStrategyChange}
      />
      <ImportConflictTable
        inspection={props.inspection}
        selected={props.selected}
        decisions={props.decisions}
        onChange={props.onDecisionChange}
      />
      {props.strategy === 'exact-restore' ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            className="sniptale-checkbox"
            type="checkbox"
            checked={props.confirmed}
            onChange={(event) => props.onConfirmedChange(event.currentTarget.checked)}
          />
          <span>{translate('settings.settingsTransfer.destructiveConfirm')}</span>
        </label>
      ) : null}
      <button
        className={settingsAddButtonClassName}
        disabled={props.busy || props.selected.size === 0 || destructiveBlocked}
        onClick={props.onCommit}
      >
        {props.busy
          ? translate('settings.settingsTransfer.working')
          : translate('settings.settingsTransfer.apply')}
      </button>
    </div>
  );
}

function ImportStrategy(props: {
  inspection: SettingsTransferInspection;
  strategy: SettingsTransferStrategy;
  onChange: (strategy: SettingsTransferStrategy) => void;
}) {
  const options = [
    { value: 'safe-merge', label: translate('settings.settingsTransfer.safeMerge') },
    { value: 'overwrite-matching', label: translate('settings.settingsTransfer.overwrite') },
    {
      value: 'exact-restore',
      label: translate('settings.settingsTransfer.exactRestore'),
      disabled: !props.inspection.exactRestoreAvailable,
    },
  ] satisfies Array<{ value: SettingsTransferStrategy; label: string; disabled?: boolean }>;
  return (
    <div className="max-w-sm text-sm">
      <span className="mb-1 block font-medium">
        {translate('settings.settingsTransfer.strategy')}
      </span>
      <ProductSelect<SettingsTransferStrategy>
        aria-label={translate('settings.settingsTransfer.strategy')}
        value={props.strategy}
        options={options}
        onChange={props.onChange}
      />
    </div>
  );
}

function ImportConflictTable(props: {
  inspection: SettingsTransferInspection;
  selected: ReadonlySet<string>;
  decisions: Record<string, SettingsTransferConflictDecision>;
  onChange: (id: string, decision: SettingsTransferConflictDecision) => void;
}) {
  const conflicts = buildVisibleSettingsTransferConflicts({
    conflicts: props.inspection.conflicts,
    selected: props.selected,
    tree: props.inspection.tree,
  });
  if (conflicts.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th className="py-2">{translate('settings.settingsTransfer.conflict')}</th>
            <th>{translate('settings.settingsTransfer.decision')}</th>
          </tr>
        </thead>
        <tbody>
          {conflicts.map(({ conflict, label }) => (
            <tr key={conflict.id} className="border-t border-[var(--sniptale-color-border-soft)]">
              <td className="max-w-xs py-2 pr-3">
                <span className="block truncate font-medium">{label}</span>
                <span className="block truncate font-mono text-[10px] text-[var(--sniptale-color-text-dim)]">
                  {conflict.nodeId}
                </span>
              </td>
              <td className="w-64 py-2">
                <ProductSelect<SettingsTransferConflictDecision>
                  controlSize="sm"
                  aria-label={translate('settings.settingsTransfer.conflictDecisionLabel').replace(
                    '{name}',
                    label
                  )}
                  value={props.decisions[conflict.id] ?? conflict.defaultDecision}
                  options={conflict.allowedDecisions.map((decision) => ({
                    value: decision,
                    label: translateConflictDecision(decision),
                  }))}
                  onChange={(decision) => props.onChange(conflict.id, decision)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function translateConflictDecision(decision: SettingsTransferConflictDecision): string {
  if (decision === 'keep-local') return translate('settings.settingsTransfer.keepLocal');
  if (decision === 'use-imported') return translate('settings.settingsTransfer.useImported');
  return translate('settings.settingsTransfer.importCopy');
}

export function ImportReport(props: { report: SettingsTransferCommitReport; onReset: () => void }) {
  const reportText = useMemo(() => `${JSON.stringify(props.report, null, 2)}\n`, [props.report]);
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'error'>('idle');
  const copyReport = async () => {
    setCopyState('copying');
    try {
      await writeBrowserClipboardText(reportText);
      setCopyState('idle');
    } catch {
      setCopyState('error');
    }
  };
  return (
    <section className={settingsPanelClassName}>
      <h2 className="text-base font-semibold">
        {translate('settings.settingsTransfer.reportTitle')}
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <dt>{translate('settings.settingsTransfer.added')}</dt>
        <dd>{props.report.added}</dd>
        <dt>{translate('settings.settingsTransfer.updated')}</dt>
        <dd>{props.report.updated}</dd>
        <dt>{translate('settings.settingsTransfer.copied')}</dt>
        <dd>{props.report.copiedRemapped}</dd>
        <dt>{translate('settings.settingsTransfer.skipped')}</dt>
        <dd>{props.report.skipped}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={settingsAddButtonClassName}
          disabled={copyState === 'copying'}
          onClick={() => void copyReport()}
        >
          {copyState === 'copying'
            ? translate('settings.settingsTransfer.working')
            : translate('settings.settingsTransfer.copyReport')}
        </button>
        <button
          className={settingsAddButtonClassName}
          onClick={() =>
            downloadSettingsTransferText('sniptale-settings-import-report.json', reportText)
          }
        >
          {translate('settings.settingsTransfer.downloadReport')}
        </button>
        <button className={settingsAddButtonClassName} onClick={props.onReset}>
          {translate('settings.settingsTransfer.done')}
        </button>
      </div>
      {copyState === 'error' ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {translate('settings.settingsTransfer.copyReportError')}
        </p>
      ) : null}
    </section>
  );
}
