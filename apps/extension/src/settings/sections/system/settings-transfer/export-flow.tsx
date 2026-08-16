import { useEffect, useState } from 'react';
import type { SettingsTransferTreeNode } from '../../../../contracts/settings-transfer';
import { translate } from '../../../../platform/i18n';
import { settingsAddButtonClassName, settingsPanelClassName } from '../../../section-surface';
import { sendSettingsTransferOperation } from './client';
import { SettingsTransferTree } from './tree';
import {
  downloadSettingsTransferText,
  flattenTransferTree,
  toggleTransferTreeSelection,
} from './ui-helpers';

export function SettingsTransferExportFlow() {
  const [tree, setTree] = useState<SettingsTransferTreeNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<'backup' | 'selective'>('backup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void sendSettingsTransferOperation({ operation: 'read-export-tree' }).then(
      (response) => {
        setTree(response.tree);
        setSelected(new Set(flattenTransferTree(response.tree).map((node) => node.id)));
      },
      () => setError(translate('settings.settingsTransfer.loadError'))
    );
  }, []);
  const toggle = (node: SettingsTransferTreeNode, checked: boolean) => {
    setSelected((current) => toggleTransferTreeSelection(current, node, checked, tree));
  };
  const exportSettings = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await sendSettingsTransferOperation({
        operation: 'build-export-package',
        exportKind: kind,
        selectedNodeIds: [...selected],
      });
      downloadSettingsTransferText(response.filename, response.fileText);
    } catch {
      setError(translate('settings.settingsTransfer.exportError'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={settingsPanelClassName}>
      <h2 className="text-base font-semibold">
        {translate('settings.settingsTransfer.exportTitle')}
      </h2>
      <p className="mt-1 text-sm text-[var(--sniptale-color-text-muted)]">
        {translate('settings.settingsTransfer.exportDescription')}
      </p>
      <div className="my-4 flex flex-wrap gap-4">
        {(['backup', 'selective'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="radio" checked={kind === value} onChange={() => setKind(value)} />
            {translate(
              value === 'backup'
                ? 'settings.settingsTransfer.completeBackup'
                : 'settings.settingsTransfer.selectivePackage'
            )}
          </label>
        ))}
      </div>
      {kind === 'selective' ? (
        <SettingsTransferTree nodes={tree} selected={selected} onToggle={toggle} />
      ) : null}
      <details className="my-4 text-sm text-[var(--sniptale-color-text-muted)]">
        <summary>{translate('settings.settingsTransfer.disclosureTitle')}</summary>
        <p className="mt-2">{translate('settings.settingsTransfer.disclosureCopy')}</p>
      </details>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-[var(--sniptale-color-danger)]">
          {error}
        </p>
      ) : null}
      <button
        className={settingsAddButtonClassName}
        disabled={busy || (kind === 'selective' && selected.size === 0)}
        onClick={() => void exportSettings()}
      >
        {busy
          ? translate('settings.settingsTransfer.working')
          : translate('settings.settingsTransfer.download')}
      </button>
    </section>
  );
}
