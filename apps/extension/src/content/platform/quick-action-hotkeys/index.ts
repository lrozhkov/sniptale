import type { BrowserStorageChangeListener } from '@sniptale/platform/browser/storage-types';
import type { HotkeyConfig, QuickAction } from '../../../contracts/settings';
import { matchesHotkeyEvent } from '../../../features/keyboard-shortcuts/hotkeys';
import { isEditableElementTarget } from '../../../ui/keyboard/editable-target';
import { isTrustedKeyboardEvent } from '../trusted-events';

const QUICK_ACTIONS_STORAGE_KEY = 'sniptale_quick_actions';
const QUICK_ACTION_HOTKEY_THROTTLE_MS = 1000;

type QuickActionHotkeyLogger = {
  error(message: string, error: unknown): void;
  log(message: string, value: unknown): void;
};

type QuickActionHotkeyStorage = {
  canObserveChanges(): boolean;
  subscribeToChanges(listener: BrowserStorageChangeListener): () => void;
};

export type QuickActionHotkeyAction = Pick<QuickAction, 'hotkey' | 'id' | 'status'>;

export type QuickActionHotkeyTrigger = (
  action: QuickActionHotkeyAction,
  event: KeyboardEvent
) => Promise<void>;

export type QuickActionHotkeyRuntimeDeps = {
  getActions?: () => Promise<QuickActionHotkeyAction[]>;
  logger?: QuickActionHotkeyLogger;
  now?: () => number;
  storage?: QuickActionHotkeyStorage;
  targetWindow?: Window;
  triggerQuickAction: QuickActionHotkeyTrigger;
};

type ResolvedQuickActionHotkeyRuntimeDeps = {
  getActions: () => Promise<QuickActionHotkeyAction[]>;
  logger: QuickActionHotkeyLogger;
  now: () => number;
  storage: QuickActionHotkeyStorage;
  targetWindow: Window;
  triggerQuickAction: QuickActionHotkeyTrigger;
};

export type QuickActionHotkeyRuntime = {
  load(): Promise<void>;
  start(): void;
  stop(): void;
};

const defaultLogger: QuickActionHotkeyLogger = {
  error: () => undefined,
  log: () => undefined,
};

export function matchesQuickActionHotkey(event: KeyboardEvent, config: HotkeyConfig): boolean {
  return matchesHotkeyEvent(event, config);
}

export function getEnabledQuickActionsWithHotkeys(
  actions: QuickActionHotkeyAction[]
): QuickActionHotkeyAction[] {
  return actions.filter((action) => action.status && action.hotkey);
}

function isTopLevelWindow(targetWindow: Window): boolean {
  return targetWindow === targetWindow.top;
}

function isEditableKeyboardTarget(event: KeyboardEvent): boolean {
  if (isEditableElementTarget(event.target)) {
    return true;
  }

  return event.composedPath().some(isEditableElementTarget);
}

class QuickActionHotkeyRuntimeController implements QuickActionHotkeyRuntime {
  private disposed = false;
  private hotkeyThrottleAt = 0;
  private quickActions: QuickActionHotkeyAction[] = [];
  private unsubscribeStorage: () => void = () => undefined;

  constructor(private readonly deps: ResolvedQuickActionHotkeyRuntimeDeps) {}

  readonly load = async (): Promise<void> => {
    const actions = await this.deps.getActions();
    if (this.disposed) {
      return;
    }

    this.quickActions = getEnabledQuickActionsWithHotkeys(actions);
    this.deps.logger.log('Loaded quick actions with hotkeys', this.quickActions.length);
  };

  readonly start = (): void => {
    if (this.deps.storage.canObserveChanges()) {
      this.unsubscribeStorage = this.deps.storage.subscribeToChanges(this.handleStorageChange);
    }
    this.deps.targetWindow.addEventListener('keydown', this.handleKeyDown, true);
    void this.load().catch((error) => this.logIfActive('Failed to load quick actions', error));
  };

  readonly stop = (): void => {
    this.disposed = true;
    this.unsubscribeStorage();
    this.deps.targetWindow.removeEventListener('keydown', this.handleKeyDown, true);
  };

  private readonly handleStorageChange: BrowserStorageChangeListener = (changes, areaName) => {
    if (areaName !== 'local' || !changes[QUICK_ACTIONS_STORAGE_KEY]) {
      return;
    }

    void this.load().catch((error) =>
      this.logIfActive('Failed to refresh quick actions after storage change', error)
    );
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.canTriggerHotkey(event)) {
      return;
    }

    const action = this.quickActions.find((entry) =>
      entry.hotkey ? matchesQuickActionHotkey(event, entry.hotkey) : false
    );
    if (!action) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void this.triggerQuickAction(action, event).catch((error) =>
      this.deps.logger.error('Failed to trigger quick action', error)
    );
  };

  private canTriggerHotkey(event: KeyboardEvent): boolean {
    return (
      isTopLevelWindow(this.deps.targetWindow) &&
      isTrustedKeyboardEvent(event) &&
      !this.isHotkeyThrottled() &&
      !isEditableKeyboardTarget(event)
    );
  }

  private isHotkeyThrottled(): boolean {
    return this.deps.now() - this.hotkeyThrottleAt < QUICK_ACTION_HOTKEY_THROTTLE_MS;
  }

  private async triggerQuickAction(
    action: QuickActionHotkeyAction,
    event: KeyboardEvent
  ): Promise<void> {
    this.hotkeyThrottleAt = this.deps.now();
    this.deps.logger.log('Quick action hotkey triggered', action.id);
    await this.deps.triggerQuickAction(action, event);
  }

  private logIfActive(message: string, error: unknown): void {
    if (!this.disposed) {
      this.deps.logger.error(message, error);
    }
  }
}

export function createQuickActionHotkeyRuntime({
  getActions,
  logger = defaultLogger,
  now = () => Date.now(),
  storage = {
    canObserveChanges: () => false,
    subscribeToChanges: () => () => undefined,
  },
  targetWindow = window,
  triggerQuickAction,
}: QuickActionHotkeyRuntimeDeps): QuickActionHotkeyRuntime {
  if (!getActions) {
    throw new Error('Quick action hotkey runtime requires a quick-action loader.');
  }

  return new QuickActionHotkeyRuntimeController({
    getActions,
    logger,
    now,
    storage,
    targetWindow,
    triggerQuickAction,
  });
}
