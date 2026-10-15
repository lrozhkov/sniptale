import { harnessReady } from './browser-mocks/browser-mocks';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from '../../../apps/extension/src/settings/shell/page';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { initializeAppTheme } from '../../../apps/extension/src/ui/theme';

initializeAppTheme();

function App() {
  return <SettingsPage />;
}

void harnessReady.then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});

// Native persistence proof stays in the excluded browser harness, never a product entrypoint.
declare global {
  interface Window {
    __sniptaleEventHistoryHarness: {
      populate(): Promise<{ readCreatedDatabase: boolean; archives: number }>;
      erase(): Promise<boolean>;
      exportFailure(): Promise<{ matches: number }>;
    };
  }
}
window.__sniptaleEventHistoryHarness = {
  async exportFailure() {
    const { createReviewExportDiagnostics } =
      await import('../../../apps/extension/src/workflows/video-review/export-diagnostics');
    const { installDiagnosticLogObserver } =
      await import('@sniptale/platform/observability/logger');
    const { createRuntimeLog } =
      await import('../../../apps/extension/src/composition/persistence/diagnostics/runtime-log');
    const log = createRuntimeLog();
    const stop = installDiagnosticLogObserver((event) => log.append(event, 'settings'));
    const diagnostics = createReviewExportDiagnostics({ destination: 'download', route: 'render' });
    try {
      try {
        await diagnostics.phase('mux-finalize', () => {
          throw new Error('private-file.webm https://private.example/token user content');
        });
      } catch (error) {
        diagnostics.reportFailure(error);
      }
      await log.settled();
      const entries = await log.read();
      return { matches: entries.filter((entry) => entry.source === 'ReviewExport').length };
    } finally {
      stop();
    }
  },
  async populate() {
    const { createEventHistoryDatabase } =
      await import('../../../apps/extension/src/composition/persistence/diagnostics/event-history-database');
    const { createEventHistory } =
      await import('../../../apps/extension/src/composition/persistence/diagnostics/event-history');
    const { runWithPersistenceMutationPermit } =
      await import('../../../apps/extension/src/composition/persistence/infrastructure/mutation-barrier');
    const db = createEventHistoryDatabase();
    await db.readState();
    const readCreatedDatabase = (await indexedDB.databases()).some(
      (entry) => entry.name === 'sniptale-event-history'
    );
    let now = Date.now() - 2 * 86400000;
    const history = createEventHistory({ database: db, now: () => now, legacy: async () => '' });
    for (let index = 0; index < 3; index++) {
      const time = new Date(now).toISOString();
      const text =
        JSON.stringify({
          schemaVersion: 1,
          time,
          lastTime: time,
          source: 'NativeHistory',
          context: 'page',
          level: 'debug',
          message: 'Native history proof',
          repeats: 1,
          dropped: 0,
        }) + '\n';
      if (!(await runWithPersistenceMutationPermit((permit) => history.append(text, permit))))
        throw new Error('Native history append failed');
      now += 86400000;
    }
    return { readCreatedDatabase, archives: (await db.list()).length };
  },
  async erase() {
    const { createEventHistoryDatabase } =
      await import('../../../apps/extension/src/composition/persistence/diagnostics/event-history-database');
    const { runWithPersistentDataErasureBarrier } =
      await import('../../../apps/extension/src/composition/persistence/infrastructure/mutation-barrier');
    const db = createEventHistoryDatabase();
    await runWithPersistentDataErasureBarrier(() => db.erase());
    return db.verifyEmpty();
  },
};
