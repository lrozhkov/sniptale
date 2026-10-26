import { contentRuntimeShimBrowser } from '@sniptale/platform/browser/content-runtime-shim';
import {
  isFullContentRuntimeMounted,
  requestFullContentRuntimeRelease,
} from '../entrypoint/markers';
import { createQuickActionHotkeyRuntime } from '../../platform/quick-action-hotkeys';
import {
  loadShimQuickActions,
  shimQuickActionStorage,
  type ShimQuickAction,
} from './quick-actions';
import { triggerQuickActionFromShim } from './transport/quick-action';
import { openPageToolbarFromShim, savePageCornerFromShim } from './transport/launcher';
import { wakeContentRuntimeFromShim } from './transport/wakeup';
import { isContentRuntimeShimDocument } from './document-policy';
import { createShimPreferencesLoader, type ShimPagePresentation } from './preferences';
import { createShimLauncher } from './launcher';

const CONTENT_RUNTIME_SHIM_CLEANUP_KEY = '__sniptaleContentRuntimeShimCleanup';
type ShimGlobal = typeof globalThis & { [CONTENT_RUNTIME_SHIM_CLEANUP_KEY]?: () => void };
function getShimGlobal(): ShimGlobal {
  return globalThis as ShimGlobal;
}

class ContentRuntimeShimController {
  private disposed = false;
  private ready = isFullContentRuntimeMounted();
  private pending = false;
  private failed = false;
  private epoch = 0;
  private presentation: ShimPagePresentation | null = null;
  private actions: ShimQuickAction[] = [];
  private launcher: ReturnType<typeof createShimLauncher> | null = null;
  private hotkeys: ReturnType<typeof createQuickActionHotkeyRuntime> | null = null;
  private readonly loadPreferences = createShimPreferencesLoader(contentRuntimeShimBrowser);
  private readonly observer = new MutationObserver(() => this.reconcile());
  private unsubscribe: () => void = () => undefined;
  start() {
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
    if (contentRuntimeShimBrowser.canObserveStorageChanges()) {
      this.unsubscribe = contentRuntimeShimBrowser.subscribeToStorageChanges(() => {
        void this.reload();
      });
    }
    getShimGlobal()[CONTENT_RUNTIME_SHIM_CLEANUP_KEY] = this.dispose;
    const wake = this.ready
      ? Promise.resolve()
      : wakeContentRuntimeFromShim().catch(() => undefined);
    void Promise.all([wake, this.reload()]).then(() => {
      this.ready = true;
      this.reconcile();
    });
  }
  private stopSurfaces() {
    this.launcher?.dispose();
    this.launcher = null;
    this.hotkeys?.stop();
    this.hotkeys = null;
  }
  private async command(operation: () => Promise<void>) {
    if (this.pending || this.disposed || isFullContentRuntimeMounted()) return;
    this.pending = true;
    this.failed = false;
    this.reconcile();
    try {
      await operation();
    } catch (error) {
      this.failed = true;
      if (!this.disposed) await requestFullContentRuntimeRelease();
      throw error;
    } finally {
      this.pending = false;
      this.reconcile();
    }
  }
  private reconcile() {
    if (this.disposed) return;
    if (isFullContentRuntimeMounted()) {
      this.stopSurfaces();
      return;
    }
    if (!this.ready) return;
    if (!this.hotkeys) {
      this.hotkeys = createQuickActionHotkeyRuntime({
        getActions: loadShimQuickActions,
        storage: shimQuickActionStorage,
        triggerQuickAction: (action) => this.command(() => triggerQuickActionFromShim(action)),
      });
      this.hotkeys.start();
    }
    if (
      !this.presentation?.preferences.enabled ||
      !['http:', 'https:'].includes(location.protocol)
    ) {
      this.launcher?.dispose();
      this.launcher = null;
      return;
    }
    const options = {
      presentation: this.presentation,
      actions: this.actions,
      failed: this.failed,
      busy: this.pending,
      open: () => this.command(() => openPageToolbarFromShim()),
      trigger: (action: ShimQuickAction) => this.command(() => triggerQuickActionFromShim(action)),
      saveCorner: async (corner: ShimPagePresentation['preferences']['corner']) => {
        await savePageCornerFromShim(corner);
        await this.reload();
      },
    };
    if (this.launcher) this.launcher.update(options);
    else if (!this.pending) this.launcher = createShimLauncher(options);
  }
  private async reload() {
    const version = ++this.epoch;
    try {
      const [nextPresentation, nextActions] = await Promise.all([
        this.loadPreferences(),
        loadShimQuickActions(),
      ]);
      if (this.disposed || version !== this.epoch) return;
      this.presentation = nextPresentation;
      this.actions = nextActions;
      this.reconcile();
    } catch {
      /* A failed read preserves the last accepted preferences. */
    }
  }

  readonly dispose = () => {
    this.disposed = true;
    ++this.epoch;
    this.observer.disconnect();
    this.unsubscribe();
    this.stopSurfaces();
    if (getShimGlobal()[CONTENT_RUNTIME_SHIM_CLEANUP_KEY] === this.dispose)
      delete getShimGlobal()[CONTENT_RUNTIME_SHIM_CLEANUP_KEY];
  };
}
function initializeContentRuntimeShim(): void {
  if (window.self !== window.top || !isContentRuntimeShimDocument(window.location)) return;
  getShimGlobal()[CONTENT_RUNTIME_SHIM_CLEANUP_KEY]?.();
  new ContentRuntimeShimController().start();
}
initializeContentRuntimeShim();
