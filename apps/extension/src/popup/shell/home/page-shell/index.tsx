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
import { PageAccessControls } from './page-access-controls';
import { isDesktopQuickAction } from '../../../../features/quick-actions-presets/policy';
import { normalizeScreenshotCaptureConfigPolicy } from '../../../../features/quick-actions-presets/policy';
import { ScreenshotModeSelector } from './mode-selector';
import { ScreenshotSetupPanel } from './setup-panel';
import { useScreenshotSetupState } from './use-screenshot-setup';
import { ScreenshotToolsPanel } from './tools-panel';
import type { ToolbarWorkingMode } from '@sniptale/runtime-contracts/messaging/message-types';
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

function isPageAccessChoiceActive(status: PageAccessStatus | null): boolean {
  return status?.supported === true && !status.currentTabActive;
}

function getPopupHomeCapabilityState(
  activeTabCapabilities: ActiveTabCapabilities,
  quickActions: QuickAction[],
  pageAccessDisabledReason: string | null,
  pageAccessStatus: PageAccessStatus | null
) {
  const shouldShowQuickActions =
    !isPageAccessChoiceActive(pageAccessStatus) || quickActions.some(isDesktopQuickAction);
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
  onOpenScreenshotMode(mode?: ToolbarWorkingMode): void;
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
  onOpenScreenshotMode,
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
  const mode = setup.state.selectedMode;
  const activeConfig = mode === 'desktop' ? setup.state.desktop : setup.state.tab;
  const tabDisabledReason = capabilityState.screenshotDisabledReason;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section
        className={[
          'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border px-3 py-2 pr-2',
          'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas))]',
        ].join(' ')}
      >
        <div className="mr-1 shrink-0 pb-1">
          <ScreenshotModeSelector
            mode={mode}
            tabDisabledReason={tabDisabledReason}
            toolsDisabledReason={tabDisabledReason}
            onModeChange={(selectedMode) => setup.update({ selectedMode })}
          />
        </div>
        {mode === 'quick-actions' ? (
          <PopupHomeQuickActions
            shouldShowQuickActions={capabilityState.shouldShowQuickActions}
            quickActionsReady={quickActionsReady}
            hasQuickActions={capabilityState.hasQuickActions}
            quickActions={quickActions}
            viewportPresets={viewportPresets}
            quickActionsDisabledTitle={capabilityState.quickActionsDisabledTitle}
            onTriggerAction={onQuickAction}
          />
        ) : mode === 'tools' ? (
          <ScreenshotToolsPanel disabledReason={tabDisabledReason} onOpen={onOpenScreenshotMode} />
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
        {mode !== 'desktop' &&
        ((pageAccessStatus?.supported === true && !pageAccessStatus.currentTabActive) ||
          pageAccessError) ? (
          <div className="mt-3 shrink-0">
            <PageAccessControls
              disabled={pageAccessPendingOperation !== null}
              error={pageAccessError}
              onRequest={onPageAccessRequest}
              pendingOperation={pageAccessPendingOperation}
              status={pageAccessStatus}
            />
          </div>
        ) : null}
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
    pageAccess.disabledReason,
    pageAccess.status
  );
  const setup = useScreenshotSetupState(
    startupMode,
    onStartupModeCleared,
    initialSetupState ?? DEFAULT_SCREENSHOT_SETUP_STATE
  );
  const {
    actionError,
    capturePending,
    handleOpenScreenshotMode,
    handleQuickAction,
    handleScreenshotCapture,
  } = usePopupHomeActions({
    screenshotDisabledReason: capabilityState.screenshotDisabledReason,
    quickActionsDisabledReason: capabilityState.quickActionsDisabledReason,
    quickActions,
  });
  const resolvedHomeError = actionError ?? homeError ?? null;

  return (
    <PopupHomePageContent
      capabilityState={capabilityState}
      onOpenScreenshotMode={(workingMode) => {
        void handleOpenScreenshotMode(workingMode);
      }}
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
            const mode = committed.selectedMode;
            if (mode === 'quick-actions') return;
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
