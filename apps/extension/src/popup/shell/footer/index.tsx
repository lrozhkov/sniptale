import { useState } from 'react';
import { PopupFooter, type PopupFooterProps } from '../../../ui/popup-shell/footer';
import { openSettingsPage } from '../../../platform/navigation/extension-pages';
import type { SettingsRoute } from '../../../platform/navigation/extension-pages/settings-route/codec';
import type { SyncPopupRuntimeStatus } from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { PopupSyncStatus } from './sync-status';
import { usePopupSyncStatus } from './use-sync-status';

function repairRoute(target: SyncPopupRuntimeStatus['repair']): SettingsRoute {
  if (target === 'security') return { section: 'access-data', view: 'secret-protection' };
  if (target === 'connection') return { section: 'saving', view: 'connection' };
  if (target === 'queue-problems')
    return { section: 'saving', view: 'queue', queueFilter: 'problems' };
  if (target === 'queue-action-required')
    return { section: 'saving', view: 'queue', queueFilter: 'action-required' };
  if (target === 'storage') return { section: 'saving', view: 'storage' };
  return { section: 'saving', view: 'queue' };
}

/** Product adapter keeps runtime observation and Settings navigation outside the shared footer. */
export default function ProductPopupFooter(props: Omit<PopupFooterProps, 'status'>) {
  const sync = usePopupSyncStatus();
  const [navigationFailed, setNavigationFailed] = useState(false);
  const navigate = (route: SettingsRoute) => {
    setNavigationFailed(false);
    void openSettingsPage({ route }).catch(() => setNavigationFailed(true));
  };
  const configured = sync.status && sync.status.configuration !== 'unconfigured';
  return (
    <PopupFooter
      {...props}
      status={
        configured ? (
          <PopupSyncStatus
            status={sync.status}
            pending={sync.pending}
            failed={sync.failed || navigationFailed}
            onSync={() => {
              setNavigationFailed(false);
              sync.sync();
            }}
            onUnlock={() => {
              setNavigationFailed(false);
              sync.unlock();
            }}
            onDetails={() => navigate({ section: 'saving', view: 'queue' })}
            onRepair={() => navigate(repairRoute(sync.status?.repair ?? null))}
          />
        ) : null
      }
    />
  );
}
