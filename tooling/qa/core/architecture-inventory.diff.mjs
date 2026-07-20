function countSignalEntries(inventory) {
  const usageSignalCount = Object.values(inventory.usageSignals).reduce(
    (count, entries) => count + entries.length,
    0
  );
  return (
    usageSignalCount +
    inventory.directBrowserCalls.length +
    inventory.defaultRuntimeMessagingImports.length +
    inventory.retiredBroadFacadeImports.length +
    inventory.authorityStateSignals.length
  );
}

function collectFilesInSet(entries, changedFiles) {
  return entries.filter((entry) => changedFiles.has(entry.file));
}

export function collectInventoryDiffSummary(inventory, changedTargets) {
  if (!changedTargets) {
    return null;
  }
  const changedFiles = new Set(changedTargets.changedFiles ?? []);
  return {
    baselineCount: countSignalEntries(inventory),
    added: {
      directBrowserCalls: collectFilesInSet(inventory.directBrowserCalls, changedFiles).length,
      defaultRuntimeMessagingImports: collectFilesInSet(
        inventory.defaultRuntimeMessagingImports,
        changedFiles
      ).length,
      retiredBroadFacadeImports: collectFilesInSet(
        inventory.retiredBroadFacadeImports,
        changedFiles
      ).length,
      authorityStateSignals: collectFilesInSet(inventory.authorityStateSignals, changedFiles)
        .length,
    },
    removed: {},
  };
}
