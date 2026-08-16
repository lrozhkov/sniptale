import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import type {
  SettingsTransferCommitReport,
  SettingsTransferInspection,
  SettingsTransferMessage,
  SettingsTransferTreeNode,
} from '../../../contracts/settings-transfer';
import { parseSettingsTransferPackageText } from '../../../contracts/settings-transfer';
import {
  applySettingsTransferDomains,
  collectSettingsTransferDynamicItems,
  collectSettingsTransferDependencies,
  readSettingsTransferSnapshot,
} from '../../../composition/persistence/settings-transfer';
import { runWithExclusivePersistenceMutationPermit } from '../../../composition/persistence/infrastructure/mutation-barrier';
import {
  buildSettingsTransferPackage,
  buildExactRestoreDomainsBySelection,
  buildSettingsTransferTree,
  filterSettingsTransferDomainsBySelection,
  fingerprintSettingsTransferDomains,
  isCompleteSettingsTransferBackup,
  parseSettingsTransferDomains,
  planSettingsTransfer,
} from '../../../workflows/settings-transfer';

export async function executeSettingsTransferOperation(message: SettingsTransferMessage) {
  switch (message.operation) {
    case 'read-export-tree': {
      const snapshot = await readSettingsTransferSnapshot();
      return {
        tree: buildSettingsTransferTree(snapshot.dynamicItems, snapshot.dependencies),
      };
    }
    case 'build-export-package': {
      const snapshot = await readSettingsTransferSnapshot();
      const tree = buildSettingsTransferTree(snapshot.dynamicItems, snapshot.dependencies);
      const built = buildSettingsTransferPackage({
        appVersion: readAppVersion(),
        domains: snapshot.domains,
        exportKind: message.exportKind,
        selectedNodeIds: message.selectedNodeIds,
        tree,
      });
      return {
        filename: createFilename(message.exportKind),
        fileText: built.fileText,
      };
    }
    case 'inspect-import':
      return { inspection: await inspectSettingsTransfer(message.fileText) };
    case 'commit-import':
      return {
        report: await commitSettingsTransfer(message),
      };
  }
}

async function inspectSettingsTransfer(fileText: string): Promise<SettingsTransferInspection> {
  const transferPackage = parseSettingsTransferPackageText(fileText);
  const imported = parseSettingsTransferDomains(transferPackage.domains);
  const current = await readSettingsTransferSnapshot();
  const currentDomains = parseSettingsTransferDomains(current.domains);
  const tree = buildSettingsTransferTree(
    collectSettingsTransferDynamicItems(imported),
    collectSettingsTransferDependencies(imported)
  );
  const plan = planSettingsTransfer({
    current: currentDomains,
    imported,
    strategy: 'safe-merge',
  });
  const exactRestoreAvailable =
    transferPackage.exportKind === 'backup' &&
    isCompleteSettingsTransferBackup({ imported, current: currentDomains });
  return {
    fingerprint: await fingerprintSettingsTransferDomains(currentDomains),
    package: { ...transferPackage, domains: imported },
    tree,
    conflicts: plan.conflicts,
    summary: plan.summary,
    exactRestoreAvailable,
  };
}

async function commitSettingsTransfer(
  message: Extract<SettingsTransferMessage, { operation: 'commit-import' }>
): Promise<SettingsTransferCommitReport> {
  const transferPackage = parseSettingsTransferPackageText(message.fileText);
  if (
    message.strategy === 'exact-restore' &&
    (transferPackage.exportKind !== 'backup' || !message.destructiveConfirmed)
  ) {
    throw new Error('Exact restore requires a complete backup and destructive confirmation');
  }
  const imported = parseSettingsTransferDomains(transferPackage.domains);
  return runWithExclusivePersistenceMutationPermit(async (permit) => {
    const current = await readSettingsTransferSnapshot();
    const currentDomains = parseSettingsTransferDomains(current.domains);
    if (
      message.strategy === 'exact-restore' &&
      (transferPackage.exportKind !== 'backup' ||
        !isCompleteSettingsTransferBackup({ imported, current: currentDomains }))
    ) {
      throw new Error('Exact restore requires a complete backup and destructive confirmation');
    }
    const currentFingerprint = await fingerprintSettingsTransferDomains(currentDomains);
    if (currentFingerprint !== message.fingerprint) throw new SettingsTransferStalePlanError();
    const tree = buildSettingsTransferTree(
      collectSettingsTransferDynamicItems(imported),
      collectSettingsTransferDependencies(imported)
    );
    const allIds = tree.flatMap(flattenTreeIds);
    const selectedNodeIds = message.selectedNodeIds.length > 0 ? message.selectedNodeIds : allIds;
    const selected =
      message.strategy === 'exact-restore'
        ? buildExactRestoreDomainsBySelection({
            current: currentDomains,
            imported,
            selectedNodeIds,
            tree,
          })
        : filterSettingsTransferDomainsBySelection({
            domains: imported,
            selectedNodeIds,
            tree,
          });
    const plan = planSettingsTransfer({
      current: currentDomains,
      imported: selected,
      strategy: message.strategy,
      decisions: message.decisions,
    });
    const affectedDomains = Object.fromEntries(
      Object.keys(selected).map((domainId) => [domainId, plan.domains[domainId]!])
    );
    const validatedDomains = parseSettingsTransferDomains(affectedDomains);
    await applySettingsTransferDomains({
      domains: validatedDomains,
      summary: plan.summary,
      permit,
    });
    return {
      ...plan.summary,
      status: 'committed' as const,
      strategy: message.strategy,
      appliedNodeIds: message.selectedNodeIds.length > 0 ? [...message.selectedNodeIds] : allIds,
    };
  });
}

function flattenTreeIds(node: SettingsTransferTreeNode): string[] {
  return [node.id, ...node.children.flatMap((child) => flattenTreeIds(child))];
}

function readAppVersion(): string {
  try {
    return runtimeInfo.getManifest().version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function createFilename(kind: 'backup' | 'selective'): string {
  return `sniptale-settings-${kind}-${new Date().toISOString().slice(0, 10)}.sniptale-settings.json`;
}

export class SettingsTransferStalePlanError extends Error {}
