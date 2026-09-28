import '@sniptale/ui/styles';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import {
  AppWindow,
  ClipboardCopy,
  Crop,
  Film,
  Images,
  MessageSquarePlus,
  MonitorPlay,
  MonitorUp,
  Paintbrush,
  Pencil,
  SwatchBook,
  TextCursorInput,
  UnfoldVertical,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';
import type { ScreenshotCaptureConfig } from '@sniptale/runtime-contracts/capture/action';
import type { ToolbarWorkingMode } from '@sniptale/runtime-contracts/messaging/message-types';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { translate, type TranslationKey } from '../../../platform/i18n/popup';
import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';
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
import { ImageEditorIcon, ScenarioEditorIcon } from '@sniptale/ui/editor-chrome';

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
    delay: mode === 'desktop' ? 3 : null,
    afterCapture,
    imageFormat: afterCapture === 'copy' ? 'png' : null,
    imageQuality: null,
    exitAfterCapture: false,
  };
}

const workspaceActions = [
  { icon: Images, labelKey: 'popup.home.libraryLabel', onClick: () => openLibrary() },
  { icon: ImageEditorIcon, labelKey: 'popup.home.imageEditorLabel', onClick: openImageEditor },
  { icon: Film, labelKey: 'popup.home.videoEditorLabel', onClick: openVideoEditor },
  {
    icon: ScenarioEditorIcon,
    labelKey: 'popup.home.scenarioEditorLabel',
    onClick: openScenarioEditor,
  },
] as const;

const pageToolActions = [
  {
    icon: Pencil,
    labelKey: 'content.toolbar.drawingLabel',
    hintKey: 'content.toolbar.drawingEnable',
    mode: 'drawing',
  },
  {
    icon: MessageSquarePlus,
    labelKey: 'content.toolbar.highlighterLabel',
    hintKey: 'content.toolbar.highlighterEnable',
    mode: 'highlighter',
  },
  {
    icon: TextCursorInput,
    labelKey: 'content.toolbar.quickEditLabel',
    hintKey: 'content.toolbar.quickEditEnable',
    mode: 'quick-edit',
  },
  {
    icon: SwatchBook,
    labelKey: 'content.toolbar.designReviewLabel',
    hintKey: 'content.toolbar.designReviewEnable',
    mode: 'design-review',
  },
] as const;

const MENU_SURFACE_CLASS_NAME = [
  'flex min-h-0 flex-1 flex-col justify-between overflow-y-auto rounded-[16px] border p-3',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)]',
].join(' ');

const CAPTURE_BUTTON_CLASS_NAME = [
  'group flex min-h-[88px] min-w-0 flex-col items-center justify-center gap-2.5 rounded-[12px] border-0',
  'bg-[var(--sniptale-color-surface-input)]',
  'px-1.5 py-2.5 text-center transition-colors',
  'hover:bg-[var(--sniptale-color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sniptale-color-accent)]',
].join(' ');
const CAPTURE_ICON_CLASS_NAME = [
  'h-7 w-7 text-[var(--sniptale-color-accent)]',
  'transition-transform duration-180 ease-out motion-reduce:transition-none',
  'group-hover:scale-110 group-focus-visible:scale-110 group-disabled:scale-100',
].join(' ');

const MENU_SMALL_ICON_CLASS_NAME = [
  'h-[18px] w-[18px] text-[var(--sniptale-color-text-secondary)]',
  'transition-[transform,color] duration-180 ease-out motion-reduce:transition-none',
  'group-hover:scale-110 group-focus-visible:scale-110 group-disabled:scale-100',
  'group-hover:text-[var(--sniptale-color-text-primary)] group-disabled:text-[var(--sniptale-color-text-secondary)]',
].join(' ');

const QUICK_SCENARIO_BUTTON_CLASS_NAME = [
  'group grid min-h-[54px] min-w-0 grid-rows-[18px_20px] content-center justify-items-center',
  'gap-1.5 rounded-[12px] border-0 bg-transparent px-1.5 py-1.5',
  'text-center transition-colors',
  'text-[var(--sniptale-color-text-secondary)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)] disabled:cursor-not-allowed disabled:opacity-45',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sniptale-color-accent)]',
].join(' ');
const SECTION_HEADING_CLASS_NAME = [
  'mb-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
  'text-[var(--sniptale-color-text-muted-strong)]',
].join(' ');
const DIVIDED_SECTION_CLASS_NAME = [
  'shrink-0 border-t pt-2',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
].join(' ');
const CAPTURE_LABEL_CLASS_NAME = [
  'whitespace-nowrap text-[9px] font-semibold leading-none',
  'text-[var(--sniptale-color-text-primary)]',
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
      icon: UnfoldVertical,
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
  const desktopDisabledReason = capabilities.videoByMode?.[CaptureMode.SCREEN]?.reason ?? null;

  const capture = async (
    actionKey: string,
    mode: ScreenshotCaptureConfig['screenshotMode'],
    afterCapture: ScreenshotCaptureConfig['afterCapture'] = 'download_default'
  ) => {
    const captureDisabledReason = mode === 'desktop' ? desktopDisabledReason : disabledReason;
    if (captureDisabledReason || pendingAction) return;
    setError(null);
    setPendingAction(actionKey);
    try {
      await triggerScreenshotCapture(buildCaptureConfig(mode, afterCapture));
    } catch (captureError) {
      setError(getMenuBrowserActionError(captureError, 'popup.home.captureError'));
      setPendingAction(null);
    }
  };
  const openToolbar = async (workingMode: ToolbarWorkingMode) => {
    setError(null);
    try {
      await openScreenshotMode(workingMode);
    } catch (openError) {
      setError(getMenuBrowserActionError(openError, 'popup.home.openPrepError'));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-ui="popup.menu.route">
      <section className={MENU_SURFACE_CLASS_NAME}>
        <header className="shrink-0 px-0.5">
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
          desktopDisabledReason={desktopDisabledReason}
          disabledReason={disabledReason}
          pendingAction={pendingAction}
          recordDisabledReason={capabilities.videoByMode?.[CaptureMode.TAB]?.reason ?? null}
          onCapture={capture}
          onRecordTab={() => navigateToDescriptor({ page: 'video', videoMode: CaptureMode.TAB })}
        />
        <section className={DIVIDED_SECTION_CLASS_NAME} data-ui="popup.menu.tools">
          <h2 className={SECTION_HEADING_CLASS_NAME}>{translate('popup.home.toolsLabel')}</h2>
          <MenuPageTools disabledReason={disabledReason} onOpenToolbar={openToolbar} />
        </section>
        <section className={DIVIDED_SECTION_CLASS_NAME} data-ui="popup.menu.workspace">
          <h2 className={SECTION_HEADING_CLASS_NAME}>{translate('popup.home.workspaceTitle')}</h2>
          <MenuWorkspace />
        </section>
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
          <Icon className={CAPTURE_ICON_CLASS_NAME} />
          <span className={CAPTURE_LABEL_CLASS_NAME}>
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
  desktopDisabledReason: string | null;
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
      icon: MonitorUp,
      label: translate('popup.home.quickDesktopEditLabel'),
      title: props.desktopDisabledReason ?? translate('popup.home.quickDesktopEditHint'),
      disabled: Boolean(props.desktopDisabledReason) || props.pendingAction !== null,
      onClick: () => void props.onCapture('edit-desktop', 'desktop', 'edit'),
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
    <div className="grid grid-cols-4 gap-1">
      {scenarios.map(({ icon: Icon, label, ...scenario }) => (
        <button
          key={label}
          type="button"
          className={QUICK_SCENARIO_BUTTON_CLASS_NAME}
          disabled={scenario.disabled}
          title={scenario.title}
          onClick={scenario.onClick}
        >
          <Icon className={MENU_SMALL_ICON_CLASS_NAME} />
          <span className="min-h-5 text-[9px] font-medium leading-[10px]">{label}</span>
        </button>
      ))}
    </div>
  );
}

function MenuPageTools({
  disabledReason,
  onOpenToolbar,
}: {
  disabledReason: string | null;
  onOpenToolbar(mode: ToolbarWorkingMode): Promise<void>;
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {pageToolActions.map(({ icon: Icon, labelKey, hintKey, mode }) => (
        <MenuToolbarButton
          key={mode}
          disabledReason={disabledReason}
          hintKey={hintKey}
          icon={Icon}
          labelKey={labelKey}
          mode={mode}
          onOpen={onOpenToolbar}
        />
      ))}
    </div>
  );
}

function MenuWorkspace() {
  return (
    <div className="grid grid-cols-4 gap-1">
      {workspaceActions.map(({ icon: Icon, labelKey, onClick }) => (
        <button
          key={labelKey}
          type="button"
          className={QUICK_SCENARIO_BUTTON_CLASS_NAME}
          onClick={onClick}
        >
          <Icon className={MENU_SMALL_ICON_CLASS_NAME} />
          <span className="min-h-5 text-[9px] font-medium leading-[10px]">
            {translate(labelKey)}
          </span>
        </button>
      ))}
    </div>
  );
}

function MenuToolbarButton({
  disabledReason,
  hintKey,
  icon: Icon,
  labelKey,
  mode,
  onOpen,
}: {
  disabledReason: string | null;
  hintKey: (typeof pageToolActions)[number]['hintKey'];
  icon: ComponentType<{ className?: string }>;
  labelKey: (typeof pageToolActions)[number]['labelKey'];
  mode: ToolbarWorkingMode;
  onOpen(mode: ToolbarWorkingMode): Promise<void>;
}) {
  return (
    <button
      type="button"
      className={QUICK_SCENARIO_BUTTON_CLASS_NAME}
      data-ui={`popup.menu.tool-action.${mode}`}
      title={disabledReason ?? translate(hintKey)}
      disabled={Boolean(disabledReason)}
      onClick={() => void onOpen(mode)}
    >
      <Icon className={MENU_SMALL_ICON_CLASS_NAME} />
      <span className="min-h-5 text-[9px] font-medium leading-[10px]">{translate(labelKey)}</span>
    </button>
  );
}
function getMenuBrowserActionError(error: unknown, summaryKey: TranslationKey): string {
  return createUserFacingErrorMessage({
    cause: error,
    detail: 'browserCommunication',
    summaryKey,
  });
}
