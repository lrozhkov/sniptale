import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { translate } from '../../../../platform/i18n/popup';
import type {
  PageAccessOperation,
  PageAccessStatus,
} from '@sniptale/runtime-contracts/messaging/page-access';
import type { PopupPageAccessRuntime } from '../../runtime/page-access';
import type { QuickAction, ViewportPreset } from '../../../../contracts/settings';
import { PopupHomeErrorMessage, PopupHomeQuickActions } from './sections';
import { usePopupHomeActions } from './actions';
import { PageAccessControls } from '../../page-access/controls';
import {
  isDesktopQuickAction,
  normalizeScreenshotCaptureConfigPolicy,
} from '../../../../features/quick-actions-presets/policy';
import { ScreenshotModeSelector } from './mode-selector';
import { ScreenshotSetupPanel } from './setup-panel';
import { useScreenshotSetupState } from './use-screenshot-setup';
import {
  DEFAULT_SCREENSHOT_SETUP_STATE,
  type ScreenshotSetupMode,
  type ScreenshotSetupState,
} from '../../../../composition/persistence/capture-settings';

interface PopupHomePageProps {
  quickActions: QuickAction[];
  quickActionsReady: boolean;
  viewportPresets: ViewportPreset[];
  activeTabCapabilities: ActiveTabCapabilities;
  homeError?: string | null;
  pageAccess?: PopupPageAccessRuntime;
  startupMode?: ScreenshotSetupMode | null;
  initialSetupState?: ScreenshotSetupState;
  onStartupModeCleared?: () => void;
}

const defaultPageAccessRuntime: PopupPageAccessRuntime = {
  disabledReason: null,
  error: null,
  handleRequest: async () => undefined,
  loading: false,
  pendingOperation: null,
  status: null,
};

function getPopupHomeCapabilityState(
  activeTabCapabilities: ActiveTabCapabilities,
  quickActions: QuickAction[],
  pageAccessStatus: PageAccessStatus | null,
  pageAccessDisabledReason: string | null
) {
  const shouldShowQuickActions =
    pageAccessStatus?.supported !== true ||
    pageAccessStatus.currentTabActive ||
    quickActions.some(isDesktopQuickAction);
  const restrictedPageFeaturesTitle = activeTabCapabilities.isRestrictedPage
    ? translate('popup.common.restrictedPageFeatures')
    : null;
  const screenshotDisabledReason =
    activeTabCapabilities.screenshotMode.reason ?? pageAccessDisabledReason;
  const quickActionsDisabledReason =
    activeTabCapabilities.quickActions.reason ?? pageAccessDisabledReason;
  return {
    shouldShowQuickActions,
    hasQuickActions: shouldShowQuickActions && quickActions.length > 0,
    screenshotDisabledReason,
    quickActionsDisabledReason,
    restrictedPageFeaturesTitle,
    screenshotDisabledTitle: restrictedPageFeaturesTitle ?? screenshotDisabledReason,
    quickActionsDisabledTitle: restrictedPageFeaturesTitle ?? quickActionsDisabledReason,
  };
}

type PopupHomeCapabilityState = ReturnType<typeof getPopupHomeCapabilityState>;

interface PopupHomePageContentProps {
  capabilityState: PopupHomeCapabilityState;
  onPageAccessRequest(operation: PageAccessOperation): void;
  onQuickAction(actionId: string): void;
  pageAccessError: string | null;
  pageAccessPendingOperation: PageAccessOperation | null;
  pageAccessStatus: PageAccessStatus | null;
  quickActions: QuickAction[];
  quickActionsReady: boolean;
  resolvedHomeError: string | null;
  setup: ReturnType<typeof useScreenshotSetupState>;
  capturePending: boolean;
  onCapture(): void;
  showHomeError: boolean;
  viewportPresets: ViewportPreset[];
}

function PopupHomePageContent({
  capabilityState,
  onPageAccessRequest,
  onQuickAction,
  pageAccessError,
  pageAccessPendingOperation,
  pageAccessStatus,
  quickActions,
  quickActionsReady,
  resolvedHomeError,
  setup,
  capturePending,
  onCapture,
  showHomeError,
  viewportPresets,
}: PopupHomePageContentProps) {
  const mode =
    setup.state.selectedMode === 'quick-actions'
      ? 'quick-actions'
      : setup.state.selectedMode === 'desktop'
        ? 'desktop'
        : 'tab';
  const activeConfig = mode === 'desktop' ? setup.state.desktop : setup.state.tab;
  const tabDisabledReason = capabilityState.screenshotDisabledReason;
  const showPageAccess =
    mode !== 'desktop' &&
    ((pageAccessStatus?.supported === true && !pageAccessStatus.currentTabActive) ||
      Boolean(pageAccessError));
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section
        className={[
          'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border p-3',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas))]',
        ].join(' ')}
      >
        <div className="shrink-0 pb-1">
          <ScreenshotModeSelector
            mode={mode}
            tabDisabledReason={tabDisabledReason}
            onModeChange={(selectedMode) => setup.update({ selectedMode })}
          />
        </div>
        {showPageAccess ? (
          <div className="min-h-0 flex-1 pt-3">
            <PageAccessControls
              disabled={pageAccessPendingOperation !== null}
              error={pageAccessError}
              onRequest={onPageAccessRequest}
              pendingOperation={pageAccessPendingOperation}
              status={pageAccessStatus}
            />
          </div>
        ) : mode === 'quick-actions' ? (
          <PopupHomeQuickActions
            shouldShowQuickActions={capabilityState.shouldShowQuickActions}
            quickActionsReady={quickActionsReady}
            hasQuickActions={capabilityState.hasQuickActions}
            quickActions={quickActions}
            viewportPresets={viewportPresets}
            quickActionsDisabledTitle={capabilityState.quickActionsDisabledTitle}
            onTriggerAction={onQuickAction}
          />
        ) : (
          <ScreenshotSetupPanel
            config={activeConfig}
            viewportPresets={viewportPresets}
            pending={!setup.ready || capturePending}
            disabledReason={mode === 'tab' ? tabDisabledReason : null}
            onChange={(config) =>
              setup.update({
                [mode]: normalizeScreenshotCaptureConfigPolicy(config),
              })
            }
            onCapture={onCapture}
          />
        )}
      </section>
      {showHomeError && resolvedHomeError ? (
        <PopupHomeErrorMessage message={resolvedHomeError} />
      ) : null}
    </div>
  );
}

export function PopupHomePage({
  quickActions,
  quickActionsReady,
  viewportPresets,
  activeTabCapabilities,
  homeError,
  pageAccess = defaultPageAccessRuntime,
  startupMode = null,
  initialSetupState,
  onStartupModeCleared,
}: PopupHomePageProps) {
  const capabilityState = getPopupHomeCapabilityState(
    activeTabCapabilities,
    quickActions,
    pageAccess.status,
    pageAccess.disabledReason
  );
  const setup = useScreenshotSetupState(
    startupMode,
    onStartupModeCleared,
    initialSetupState ?? DEFAULT_SCREENSHOT_SETUP_STATE
  );
  const { actionError, capturePending, handleQuickAction, handleScreenshotCapture } =
    usePopupHomeActions({
      screenshotDisabledReason: capabilityState.screenshotDisabledReason,
      quickActionsDisabledReason: capabilityState.quickActionsDisabledReason,
      quickActions,
    });
  const resolvedHomeError = actionError ?? homeError ?? null;

  return (
    <PopupHomePageContent
      capabilityState={capabilityState}
      onPageAccessRequest={(operation) => {
        void pageAccess.handleRequest(operation);
      }}
      onQuickAction={(actionId) => {
        void handleQuickAction(actionId);
      }}
      pageAccessError={pageAccess.error}
      pageAccessPendingOperation={pageAccess.pendingOperation}
      pageAccessStatus={pageAccess.status}
      quickActions={quickActions}
      quickActionsReady={quickActionsReady}
      resolvedHomeError={resolvedHomeError}
      setup={setup}
      capturePending={capturePending}
      onCapture={() => {
        void setup
          .flush()
          .then((committed) => {
            if (committed.selectedMode === 'quick-actions') return;
            const mode = committed.selectedMode === 'desktop' ? 'desktop' : 'tab';
            void handleScreenshotCapture(
              mode === 'desktop' ? committed.desktop : committed.tab,
              mode === 'tab' ? capabilityState.screenshotDisabledReason : null
            );
          })
          .catch(() => undefined);
      }}
      showHomeError={
        actionError != null || !activeTabCapabilities.isRestrictedPage || homeError != null
      }
      viewportPresets={viewportPresets}
    />
  );
}
