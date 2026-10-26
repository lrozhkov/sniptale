import { registerPageRecoveryTeardown } from './lifecycle';
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../platform/i18n';
import { pagePreparationHistory } from '../../parser/page-preparation/history';
import { parsePagePreparationRecovery } from '../../parser/page-preparation/history/recovery-parser';
import { PageRecoveryClient } from './client';
import { PageRecoveryController, type PageRecoveryState } from './controller';

const IDLE: PageRecoveryState = { available: false, pending: false, error: false };
interface PageRecoveryUI {
  state: PageRecoveryState;
  busy: boolean;
  restore(): Promise<boolean>;
  discard(action: () => void): Promise<boolean>;
}
export const PageRecoveryContext = createContext<PageRecoveryUI | null>(null);

/** The real page toolbar owns this disposable producer; editors and viewers never mount it. */
export function usePageRecovery(finalize: () => void, enabled: boolean): PageRecoveryUI {
  const eligible =
    enabled && window.top === window && ['http:', 'https:'].includes(location.protocol);
  const finalizeRef = useRef(finalize);
  finalizeRef.current = finalize;
  const controllerRef = useRef<PageRecoveryController | null>(null);
  const command = useRef(false);
  const [state, setState] = useState(IDLE);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!eligible) {
      setState(IDLE);
      return;
    }
    const client = new PageRecoveryClient(() => controllerRef.current?.unavailable());
    const controller = new PageRecoveryController({
      request: (message) => client.request(message),
      capture: () => {
        const raw = pagePreparationHistory.captureRecovery();
        if (!raw) return null;
        const parsed = parsePagePreparationRecovery(raw);
        if (!parsed) throw new Error('Page recovery format is unavailable');
        return parsed;
      },
      apply: (value) => pagePreparationHistory.restoreRecovery(value),
    });
    controllerRef.current = controller;
    const unsubscribe = controller.subscribe(() => setState(controller.getSnapshot()));
    let token = pagePreparationHistory.getRecoveryToken();
    let hadChanges = pagePreparationHistory.hasChanges();
    let serviceTeardown = false;
    const changed = () => {
      if (serviceTeardown) return;
      const next = pagePreparationHistory.getRecoveryToken();
      if (next === token) return;
      token = next;
      const hasChanges = pagePreparationHistory.hasChanges();
      if (hasChanges || hadChanges) void controller.changed();
      hadChanges = hasChanges;
    };
    const unsubscribeHistory = pagePreparationHistory.subscribe(changed);
    const unregisterTeardown = registerPageRecoveryTeardown(() => {
      finalizeRef.current();
      changed();
      void controller.flushBeforeNavigation();
      serviceTeardown = true;
      return () => {
        token = pagePreparationHistory.getRecoveryToken();
        hadChanges = pagePreparationHistory.hasChanges();
        serviceTeardown = false;
      };
    });
    const pagehide = () => {
      try {
        finalizeRef.current();
        changed();
        void controller.flushBeforeNavigation();
      } catch {
        /* Keep the last acknowledged private version if a pending editor cannot finish. */
      }
    };
    window.addEventListener('beforeunload', pagehide);
    window.addEventListener('pagehide', pagehide);
    void controller.open();
    return () => {
      window.removeEventListener('beforeunload', pagehide);
      window.removeEventListener('pagehide', pagehide);
      unregisterTeardown();
      unsubscribeHistory();
      unsubscribe();
      controllerRef.current = null;
      controller.dispose();
      client.dispose();
    };
  }, [eligible]);
  const perform = useCallback(
    async (
      action: (controller: PageRecoveryController) => Promise<boolean>,
      excludedAction?: () => void
    ) => {
      if (command.current) return false;
      command.current = true;
      setBusy(true);
      try {
        const controller = controllerRef.current;
        if (!controller && eligible) return false;
        finalizeRef.current();
        if (!controller) {
          excludedAction?.();
          return excludedAction !== undefined;
        }
        const success = await action(controller);
        if (!success) showToast(translate('content.toolbar.pageRecoveryFailed'), 'error');
        return success;
      } catch {
        showToast(translate('content.toolbar.pageRecoveryFailed'), 'error');
        return false;
      } finally {
        command.current = false;
        setBusy(false);
      }
    },
    [eligible]
  );
  return {
    state,
    busy,
    restore: () => perform((controller) => controller.restore()),
    discard: (action) => perform((controller) => controller.discard(action), action),
  };
}
