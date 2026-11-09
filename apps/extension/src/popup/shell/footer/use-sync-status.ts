import { useEffect, useRef, useState } from 'react';
import type { SyncPopupRuntimeStatus } from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  createSyncProductClient,
  subscribeToSyncProductSettled,
  subscribeToSyncQueueSettled,
} from '../../../platform/runtime-messaging/sync-product-client';

const UNKNOWN: SyncPopupRuntimeStatus = {
  configuration: 'unknown',
  connection: null,
  localPublication: 'unknown',
  activity: 'unknown',
  remote: { knowledge: 'unknown' },
  protection: 'unknown',
  issue: null,
  repair: null,
};
interface Observation {
  status: SyncPopupRuntimeStatus | null;
  pending: boolean;
  failed: boolean;
}
interface Commands {
  sync(): void;
  unlock(): void;
}

/** Observes only while mounted. Explicit commands continue in background after the popup closes. */
export function usePopupSyncStatus() {
  const [view, setView] = useState<Observation>({ status: null, pending: false, failed: false });
  const commands = useRef<Commands | null>(null);
  useEffect(() => {
    const client = createSyncProductClient();
    let active = true;
    let reading = false;
    let readAgain = false;
    let actionRunning = false;
    let projectionEpoch = 0;
    let unlockRequest: string | null = null;
    const finish = (failed: boolean) => {
      if (!active) return;
      actionRunning = false;
      unlockRequest = null;
      projectionEpoch++;
      setView((current) => ({ ...current, pending: false, failed }));
    };
    const refresh = async () => {
      if (!active) return;
      if (reading) {
        readAgain = true;
        return;
      }
      reading = true;
      const epoch = projectionEpoch;
      try {
        const status = await client.readRuntimeStatus();
        if (!active) return;
        if (epoch === projectionEpoch) setView((current) => ({ ...current, status }));
        const selected = unlockRequest;
        if (selected) {
          const result = await client.readOwnSyncUnlock(selected).catch(() => {
            if (active && unlockRequest === selected) {
              finish(true);
              readAgain = true;
            }
            return null;
          });
          if (!result || !active || unlockRequest !== selected) return;
          if (
            !result.success ||
            !result.status ||
            ['expired', 'restart-required', 'failed'].includes(result.status)
          ) {
            finish(true);
            readAgain = true;
          } else if (result.status === 'completed') {
            // Background consumed the one-shot continuation. Never issue a second flush here.
            finish(false);
            readAgain = true;
          }
        }
      } catch {
        if (active && epoch === projectionEpoch)
          setView((current) => ({ ...current, status: UNKNOWN }));
      } finally {
        reading = false;
        if (active && readAgain) {
          readAgain = false;
          void refresh();
        }
      }
    };
    const run = async (kind: 'sync' | 'unlock') => {
      if (!active || actionRunning) return;
      actionRunning = true;
      projectionEpoch++;
      setView((current) => ({ ...current, pending: true, failed: false }));
      try {
        if (kind === 'sync') {
          const result = await client.flushCheckpoints();
          if (!active) return;
          if (result.kind !== 'checkpoint-flushed') throw new Error('Sync command refused');
          finish(false);
        } else {
          const result = await client.startSyncUnlock();
          if (!active) return;
          if (!result.success) throw new Error('Unlock command refused');
          if (result.status === 'completed') finish(false);
          else if (
            (result.status === 'pending' || result.status === 'submitted') &&
            result.requestId
          )
            unlockRequest = result.requestId;
          else throw new Error('Unlock observation refused');
        }
      } catch {
        finish(true);
      } finally {
        if (active) void refresh();
      }
    };
    commands.current = {
      sync: () => {
        void run('sync');
      },
      unlock: () => {
        void run('unlock');
      },
    };
    const queue = subscribeToSyncQueueSettled(() => {
      void refresh();
    });
    const product = subscribeToSyncProductSettled(() => {
      void refresh();
    });
    const timer = setInterval(() => {
      void refresh();
    }, 2000);
    void refresh();
    return () => {
      active = false;
      commands.current = null;
      clearInterval(timer);
      queue();
      product();
    };
  }, []);
  return {
    ...view,
    sync: () => commands.current?.sync(),
    unlock: () => commands.current?.unlock(),
  };
}
