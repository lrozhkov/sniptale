import { useRef, useState } from 'react';
import type {
  SettingsTransferCommitReport,
  SettingsTransferConflictDecision,
  SettingsTransferInspection,
  SettingsTransferStrategy,
  SettingsTransferTreeNode,
} from '../../../../contracts/settings-transfer';
import { SETTINGS_TRANSFER_MAX_BYTES } from '../../../../contracts/settings-transfer';
import { translate } from '../../../../platform/i18n';
import { settingsPanelClassName, useSettingsNavigationLock } from '../../../section-surface';
import { sendSettingsTransferOperation } from './client';
import { ImportFilePicker, ImportReport, ImportReview } from './import-surface';
import { flattenTransferTree, toggleTransferTreeSelection } from './ui-helpers';

export function SettingsTransferImportFlow() {
  const { setLocked: setNavigationLocked } = useSettingsNavigationLock();
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const inspectionRequestRef = useRef(0);
  const [fileText, setFileText] = useState('');
  const [inspection, setInspection] = useState<SettingsTransferInspection | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [strategy, setStrategy] = useState<SettingsTransferStrategy>('safe-merge');
  const [decisions, setDecisions] = useState<Record<string, SettingsTransferConflictDecision>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [report, setReport] = useState<SettingsTransferCommitReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [error, setError] = useState('');
  const inspectFile = async (file: File) => {
    if (commitBusy) return;
    const requestId = ++inspectionRequestRef.current;
    setBusy(true);
    setError('');
    setReport(null);
    setFileText('');
    setInspection(null);
    setSelected(new Set());
    setDecisions({});
    setConfirmed(false);
    try {
      if (file.size > SETTINGS_TRANSFER_MAX_BYTES) throw new Error('Settings file is too large');
      const text = await file.text();
      if (requestId !== inspectionRequestRef.current) return;
      const response = await sendSettingsTransferOperation({
        operation: 'inspect-import',
        fileText: text,
      });
      if (requestId !== inspectionRequestRef.current) return;
      setFileText(text);
      setInspection(response.inspection);
      setSelected(new Set(flattenTransferTree(response.inspection.tree).map((node) => node.id)));
      setDecisions(
        Object.fromEntries(
          response.inspection.conflicts.map((conflict) => [conflict.id, conflict.defaultDecision])
        )
      );
    } catch {
      if (requestId !== inspectionRequestRef.current) return;
      setError(translate('settings.settingsTransfer.fileError'));
    } finally {
      if (requestId === inspectionRequestRef.current) setBusy(false);
    }
  };
  const commit = async () => {
    if (!inspection || busy) return;
    setBusy(true);
    setCommitBusy(true);
    setNavigationLocked(true);
    setError('');
    try {
      const response = await sendSettingsTransferOperation({
        operation: 'commit-import',
        fileText,
        strategy,
        selectedNodeIds: [...selected],
        decisions,
        fingerprint: inspection.fingerprint,
        destructiveConfirmed: confirmed,
      });
      setReport(response.report);
    } catch (caught) {
      setError(
        translate(
          (caught as { code?: string }).code === 'stale-plan'
            ? 'settings.settingsTransfer.staleError'
            : 'settings.settingsTransfer.importError'
        )
      );
    } finally {
      setBusy(false);
      setCommitBusy(false);
      setNavigationLocked(false);
    }
  };
  const toggle = (node: SettingsTransferTreeNode, checked: boolean) =>
    setSelected((current) =>
      toggleTransferTreeSelection(current, node, checked, inspection?.tree ?? [])
    );
  if (report) {
    return (
      <ImportReport
        report={report}
        onReset={() => {
          setReport(null);
          setInspection(null);
          setFileText('');
          requestAnimationFrame(() => pickerButtonRef.current?.focus());
        }}
      />
    );
  }
  return (
    <section className={settingsPanelClassName}>
      <h2 className="text-base font-semibold">
        {translate('settings.settingsTransfer.importTitle')}
      </h2>
      <ImportFilePicker
        inputRef={inputRef}
        buttonRef={pickerButtonRef}
        disabled={commitBusy}
        onFile={inspectFile}
      />
      {inspection ? (
        <ImportReview
          inspection={inspection}
          selected={selected}
          strategy={strategy}
          decisions={decisions}
          confirmed={confirmed}
          busy={busy}
          onToggle={toggle}
          onStrategyChange={(next) => {
            setStrategy(next);
            setDecisions(defaultConflictDecisions(inspection, next));
            setConfirmed(false);
          }}
          onDecisionChange={(id, decision) =>
            setDecisions((current) => ({ ...current, [id]: decision }))
          }
          onConfirmedChange={setConfirmed}
          onCommit={() => void commit()}
        />
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-[var(--sniptale-color-danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function defaultConflictDecisions(
  inspection: SettingsTransferInspection,
  strategy: SettingsTransferStrategy
): Record<string, SettingsTransferConflictDecision> {
  return Object.fromEntries(
    inspection.conflicts.map((conflict) => [
      conflict.id,
      strategy === 'safe-merge' && conflict.kind === 'item' ? 'import-as-copy' : 'use-imported',
    ])
  );
}
