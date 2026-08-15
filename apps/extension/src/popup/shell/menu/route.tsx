import '@sniptale/ui/styles';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import {
  AppWindow,
  ClipboardCopy,
  Crop,
  Film,
  Image,
  Images,
  LayoutPanelTop,
  MonitorPlay,
  Paintbrush,
  PanelTopOpen,
  ScrollText,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../platform/i18n/popup';
import PopupFooter from '../footer';
import {
  openGithubRepository,
  openImageEditor,
  openLibrary,
  openScenarioEditor,
  openScreenshotMode,
  openSettings,
  openVideoEditor,
  triggerScreenshotCapture,
} from '../navigation/actions';
import { useActiveTabCapabilities } from '../tab-access/capabilities';
import { usePopupPageAccessRuntime, type PopupPageAccessRuntime } from '../runtime/page-access';
import { PageAccessControls } from '../page-access/controls';
import type { PopupStartupDescriptor } from '../startup/descriptor';

type MenuAction = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  mode: ScreenshotCaptureConfig['screenshotMode'];
};

function buildCaptureConfig(
  mode: ScreenshotCaptureConfig['screenshotMode'],
  afterCapture: ScreenshotCaptureConfig['afterCapture'] = 'download_default'
): ScreenshotCaptureConfig {
  return {
    screenshotMode: mode,
    viewportPresetId: null,
    delay: null,
    afterCapture,
    imageFormat: afterCapture === 'copy' ? 'png' : null,
    imageQuality: null,
    exitAfterCapture: false,
  };
}

const workspaceActions = [
  { icon: Images, labelKey: 'popup.home.libraryLabel', onClick: () => openLibrary() },
  { icon: Film, labelKey: 'popup.home.videoEditorLabel', onClick: openVideoEditor },
  { icon: Image, labelKey: 'popup.home.imageEditorLabel', onClick: openImageEditor },
  { icon: ScrollText, labelKey: 'popup.home.scenarioEditorLabel', onClick: openScenarioEditor },
] as const;

const MENU_SURFACE_CLASS_NAME = [
  'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border p-3',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)]',
].join(' ');

const CAPTURE_BUTTON_CLASS_NAME = [
  'group flex min-h-[88px] min-w-0 flex-col items-center justify-center gap-2.5 rounded-[14px] border',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_70%,transparent)]',
  'px-1.5 py-2.5 text-center transition-colors',
  'hover:border-[var(--sniptale-color-border-accent-soft)]',
  'hover:bg-[var(--sniptale-color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

const WORKSPACE_BUTTON_CLASS_NAME = [
  'group flex min-h-12 items-center gap-2.5 rounded-[12px] border px-3 text-left text-xs font-medium',
  'border-[var(--sniptale-color-border-soft)] text-[var(--sniptale-color-text-primary)]',
  'transition-colors hover:border-[var(--sniptale-color-border-accent-soft)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

const QUICK_SCENARIO_BUTTON_CLASS_NAME = [
  'group flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[12px]',
  'border border-transparent bg-transparent px-1.5 py-2 text-center transition-colors',
  'text-[var(--sniptale-color-text-secondary)]',
  'hover:border-[var(--sniptale-color-border-soft)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)] disabled:cursor-not-allowed disabled:opacity-45',
].join(' ');
const SECTION_HEADING_CLASS_NAME = [
  'mb-2 text-[10px] font-semibold uppercase tracking-[0.08em]',
  'text-[var(--sniptale-color-text-muted-strong)]',
].join(' ');
const CAPTURE_LABEL_CLASS_NAME = [
  'whitespace-nowrap text-[9px] font-semibold leading-none',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');
const HOVER_LIFT_CLASS_NAME = [
  'transition-transform duration-200 ease-out',
  'group-hover:-translate-y-px group-focus-visible:-translate-y-px',
  'group-disabled:translate-y-0 motion-reduce:transition-none',
].join(' ');

function getCaptureActions(): MenuAction[] {
  return [
    {
      icon: AppWindow,
      label: translate('popup.home.captureVisibleLabel'),
      hint: translate('popup.home.captureVisibleHint'),
      mode: 'visible',
    },
    {
      icon: LayoutPanelTop,
      label: translate('popup.home.captureFullLabel'),
      hint: translate('popup.home.captureFullHint'),
      mode: 'full',
    },
    {
      icon: Crop,
      label: translate('popup.home.captureSelectionLabel'),
      hint: translate('popup.home.captureSelectionHint'),
      mode: 'selection',
    },
  ];
}

export function MenuRoute({
  navigateToDescriptor,
}: {
  navigateToDescriptor(descriptor: PopupStartupDescriptor): void;
}) {
  const capabilities = useActiveTabCapabilities();
  const pageAccess = usePopupPageAccessRuntime(capabilities);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const disabledReason = capabilities.screenshotMode.reason ?? pageAccess.disabledReason;

  const capture = async (
    actionKey: string,
    mode: ScreenshotCaptureConfig['screenshotMode'],
    afterCapture: ScreenshotCaptureConfig['afterCapture'] = 'download_default'
  ) => {
    if (disabledReason || pendingAction) return;
    setError(null);
    setPendingAction(actionKey);
    try {
      await triggerScreenshotCapture(buildCaptureConfig(mode, afterCapture));
    } catch (captureError) {
      setError(
        captureError instanceof Error ? captureError.message : translate('popup.home.captureError')
      );
      setPendingAction(null);
    }
  };
  const openToolbar = async () => {
    setError(null);
    try {
      await openScreenshotMode();
    } catch (openError) {
      setError(
        openError instanceof Error ? openError.message : translate('popup.home.openPrepError')
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-ui="popup.menu.route">
      <section className={MENU_SURFACE_CLASS_NAME}>
        <header className="mb-2.5 shrink-0 px-0.5">
          <h1 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('popup.home.menuTitle')}
          </h1>
          <p className="mt-0.5 text-[11px] leading-[1.4] text-[var(--sniptale-color-text-muted)]">
            {translate('popup.home.menuSubtitle')}
          </p>
        </header>
        <MenuPrimaryActions
          disabledReason={disabledReason}
          pageAccess={pageAccess}
          pendingAction={pendingAction}
          onCapture={capture}
        />
        <MenuQuickScenarios
          disabledReason={disabledReason}
          pendingAction={pendingAction}
          recordDisabledReason={capabilities.videoByMode?.[CaptureMode.TAB]?.reason ?? null}
          onCapture={capture}
          onRecordTab={() => navigateToDescriptor({ page: 'video', videoMode: CaptureMode.TAB })}
        />
        <div className="mt-auto shrink-0" data-ui="popup.menu.workspace">
          <h2 className={SECTION_HEADING_CLASS_NAME}>{translate('popup.home.workspaceTitle')}</h2>
          <MenuWorkspace disabledReason={disabledReason} onOpenToolbar={openToolbar} />
        </div>
        {error ? (
          <p className="mt-2 text-[11px] text-[var(--sniptale-color-danger)]" role="alert">
            {error}
          </p>
        ) : null}
      </section>
      <PopupFooter onOpenGithub={openGithubRepository} onOpenSettings={openSettings} />
    </div>
  );
}

function MenuPrimaryActions(props: {
  disabledReason: string | null;
  pageAccess: PopupPageAccessRuntime;
  pendingAction: string | null;
  onCapture(actionKey: string, mode: ScreenshotCaptureConfig['screenshotMode']): Promise<void>;
}) {
  const showPageAccess =
    (props.pageAccess.status?.supported === true && !props.pageAccess.status.currentTabActive) ||
    Boolean(props.pageAccess.error);
  if (showPageAccess) {
    return (
      <PageAccessControls
        disabled={props.pageAccess.pendingOperation !== null}
        error={props.pageAccess.error}
        onRequest={(operation) => void props.pageAccess.handleRequest(operation)}
        pendingOperation={props.pageAccess.pendingOperation}
        status={props.pageAccess.status}
      />
    );
  }

  return (
    <MenuCaptureActions
      disabledReason={props.disabledReason}
      pendingAction={props.pendingAction}
      onCapture={props.onCapture}
    />
  );
}

function MenuCaptureActions(props: {
  disabledReason: string | null;
  pendingAction: string | null;
  onCapture(actionKey: string, mode: ScreenshotCaptureConfig['screenshotMode']): Promise<void>;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {getCaptureActions().map(({ icon: Icon, label, hint, mode }) => (
        <button
          key={mode}
          type="button"
          className={CAPTURE_BUTTON_CLASS_NAME}
          disabled={Boolean(props.disabledReason) || props.pendingAction !== null}
          title={props.disabledReason ?? hint}
          onClick={() => void props.onCapture(`download:${mode}`, mode)}
        >
          <Icon
            className={`h-7 w-7 text-[var(--sniptale-color-accent)] ${HOVER_LIFT_CLASS_NAME}`}
          />
          <span className={`${CAPTURE_LABEL_CLASS_NAME} ${HOVER_LIFT_CLASS_NAME}`}>
            {props.pendingAction === `download:${mode}`
              ? translate('popup.home.capturePendingLabel')
              : label}
          </span>
        </button>
      ))}
    </div>
  );
}

function MenuQuickScenarios(props: {
  disabledReason: string | null;
  pendingAction: string | null;
  recordDisabledReason: string | null;
  onCapture(
    actionKey: string,
    mode: ScreenshotCaptureConfig['screenshotMode'],
    afterCapture: ScreenshotCaptureConfig['afterCapture']
  ): Promise<void>;
  onRecordTab(): void;
}) {
  const scenarios = [
    {
      icon: Paintbrush,
      label: translate('popup.home.quickEditTabLabel'),
      title: props.disabledReason ?? translate('popup.home.quickEditTabHint'),
      disabled: Boolean(props.disabledReason) || props.pendingAction !== null,
      onClick: () => void props.onCapture('edit-tab', 'visible', 'edit'),
    },
    {
      icon: ClipboardCopy,
      label: translate('popup.home.quickCopyTabLabel'),
      title: props.disabledReason ?? translate('popup.home.quickCopyTabHint'),
      disabled: Boolean(props.disabledReason) || props.pendingAction !== null,
      onClick: () => void props.onCapture('copy-tab', 'visible', 'copy'),
    },
    {
      icon: MonitorPlay,
      label: translate('popup.home.quickRecordTabLabel'),
      title: props.recordDisabledReason ?? translate('popup.home.quickRecordTabHint'),
      disabled: Boolean(props.recordDisabledReason) || props.pendingAction !== null,
      onClick: props.onRecordTab,
    },
  ];

  return (
    <div className="mt-2 grid grid-cols-3 gap-1">
      {scenarios.map(({ icon: Icon, label, ...scenario }) => (
        <button
          key={label}
          type="button"
          className={QUICK_SCENARIO_BUTTON_CLASS_NAME}
          disabled={scenario.disabled}
          title={scenario.title}
          onClick={scenario.onClick}
        >
          <Icon className={`h-[18px] w-[18px] ${HOVER_LIFT_CLASS_NAME}`} />
          <span className={`text-[9px] font-medium leading-tight ${HOVER_LIFT_CLASS_NAME}`}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

function MenuWorkspace({
  disabledReason,
  onOpenToolbar,
}: {
  disabledReason: string | null;
  onOpenToolbar(): Promise<void>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {workspaceActions.map(({ icon: Icon, labelKey, onClick }) => (
        <button
          key={labelKey}
          type="button"
          className={WORKSPACE_BUTTON_CLASS_NAME}
          onClick={onClick}
        >
          <Icon
            className={`h-4 w-4 text-[var(--sniptale-color-text-secondary)] ${HOVER_LIFT_CLASS_NAME}`}
          />
          <span className={HOVER_LIFT_CLASS_NAME}>{translate(labelKey)}</span>
        </button>
      ))}
      <div className="col-span-2" data-ui="popup.menu.toolbar-action">
        <MenuToolbarButton disabledReason={disabledReason} onOpen={onOpenToolbar} />
      </div>
    </div>
  );
}

function MenuToolbarButton({
  disabledReason,
  onOpen,
}: {
  disabledReason: string | null;
  onOpen(): Promise<void>;
}) {
  return (
    <button
      type="button"
      className={`${WORKSPACE_BUTTON_CLASS_NAME} w-full`}
      title={disabledReason ?? translate('popup.home.toolsOpenHint')}
      disabled={Boolean(disabledReason)}
      onClick={() => void onOpen()}
    >
      <PanelTopOpen
        className={`h-4 w-4 text-[var(--sniptale-color-accent)] ${HOVER_LIFT_CLASS_NAME}`}
      />
      <span className={HOVER_LIFT_CLASS_NAME}>{translate('popup.home.toolsOpenLabel')}</span>
    </button>
  );
}
