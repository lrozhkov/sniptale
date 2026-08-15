import {
  MessageSquarePlus,
  Pencil,
  SwatchBook,
  TextCursorInput,
  Touchpad,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { ToolbarWorkingMode } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate, type TranslationKey } from '../../../platform/i18n/popup';

const tools: ReadonlyArray<{
  mode?: ToolbarWorkingMode;
  icon: LucideIcon;
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  dataUi: string;
}> = [
  {
    icon: Touchpad,
    labelKey: 'popup.home.toolsOpenLabel',
    hintKey: 'popup.home.toolsOpenHint',
    dataUi: 'popup.home.tools.open',
  },
  {
    mode: 'drawing',
    icon: Pencil,
    labelKey: 'content.toolbar.drawingLabel',
    hintKey: 'content.toolbar.drawingEnable',
    dataUi: 'popup.home.tools.drawing',
  },
  {
    mode: 'highlighter',
    icon: MessageSquarePlus,
    labelKey: 'content.toolbar.highlighterLabel',
    hintKey: 'content.toolbar.highlighterEnable',
    dataUi: 'popup.home.tools.highlighter',
  },
  {
    mode: 'quick-edit',
    icon: TextCursorInput,
    labelKey: 'content.toolbar.quickEditLabel',
    hintKey: 'content.toolbar.quickEditEnable',
    dataUi: 'popup.home.tools.quick-edit',
  },
  {
    mode: 'design-review',
    icon: SwatchBook,
    labelKey: 'content.toolbar.designReviewLabel',
    hintKey: 'content.toolbar.designReviewEnable',
    dataUi: 'popup.home.tools.design-review',
  },
  {
    mode: 'video-recording',
    icon: Video,
    labelKey: 'content.toolbar.videoRecordingLabel',
    hintKey: 'content.toolbar.videoRecordingEnable',
    dataUi: 'popup.home.tools.video-recording',
  },
];

const TOOL_BUTTON_CLASS_NAME = [
  'group flex h-12 min-h-12 w-full min-w-0 shrink-0 flex-row items-center gap-2.5 rounded-[13px] border',
  'border-[var(--sniptale-color-border-soft)] px-3 py-1 text-left transition-colors',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_54%,transparent)]',
  'hover:border-[var(--sniptale-color-border-accent-soft)]',
  'hover:bg-[var(--sniptale-color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45',
].join(' ');

const OPEN_TOOLBAR_CLASS_NAME = [
  TOOL_BUTTON_CLASS_NAME,
  'h-[50px] min-h-[50px]',
  'border-[var(--sniptale-color-border-accent-soft)]',
].join(' ');
const TOOL_ICON_CLASS_NAME = [
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]',
  'bg-[var(--sniptale-color-accent-soft)]',
].join(' ');
const TOOL_GROUP_HEADING_CLASS_NAME = [
  'mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
  'text-[var(--sniptale-color-text-muted-strong)]',
].join(' ');
const TOOL_HOVER_LIFT_CLASS_NAME = [
  'transition-transform duration-200 ease-out',
  'group-hover:-translate-y-px group-focus-visible:-translate-y-px',
  'group-disabled:translate-y-0 motion-reduce:transition-none',
].join(' ');

function ToolButton(props: {
  tool: (typeof tools)[number];
  disabledReason: string | null;
  onOpen(mode?: ToolbarWorkingMode): void;
}) {
  const label = translate(props.tool.labelKey);
  const hint = translate(props.tool.hintKey);
  const Icon = props.tool.icon;
  return (
    <button
      type="button"
      className={props.tool.mode ? TOOL_BUTTON_CLASS_NAME : OPEN_TOOLBAR_CLASS_NAME}
      data-ui={props.tool.dataUi}
      disabled={Boolean(props.disabledReason)}
      title={props.disabledReason ?? hint}
      onClick={() => props.onOpen(props.tool.mode)}
    >
      <span className={`${TOOL_ICON_CLASS_NAME} ${TOOL_HOVER_LIFT_CLASS_NAME}`}>
        <Icon className="h-5 w-5 text-[var(--sniptale-color-accent)]" />
      </span>
      <span className={`min-w-0 ${TOOL_HOVER_LIFT_CLASS_NAME}`}>
        <span className="block text-[11px] font-semibold leading-tight text-[var(--sniptale-color-text-primary)]">
          {label}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[9px] leading-[1.25] text-[var(--sniptale-color-text-muted)]">
          {hint}
        </span>
      </span>
    </button>
  );
}

export function PopupToolsPanel(props: {
  disabledReason: string | null;
  onOpen(mode?: ToolbarWorkingMode): void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden pb-1" data-ui="popup.tools.actions">
      <ToolButton tool={tools[0]!} disabledReason={props.disabledReason} onOpen={props.onOpen} />
      <section className="mt-2" aria-labelledby="popup-tools-editing">
        <h2 id="popup-tools-editing" className={TOOL_GROUP_HEADING_CLASS_NAME}>
          {translate('popup.home.toolsEditingGroup')}
        </h2>
        <div className="flex flex-col gap-1">
          {tools.slice(1, 4).map((tool) => (
            <ToolButton
              key={tool.dataUi}
              tool={tool}
              disabledReason={props.disabledReason}
              onOpen={props.onOpen}
            />
          ))}
        </div>
      </section>
      <section className="mt-2" aria-labelledby="popup-tools-workflow">
        <h2 id="popup-tools-workflow" className={TOOL_GROUP_HEADING_CLASS_NAME}>
          {translate('popup.home.toolsWorkflowGroup')}
        </h2>
        <div className="flex flex-col gap-1">
          {tools.slice(4).map((tool) => (
            <ToolButton
              key={tool.dataUi}
              tool={tool}
              disabledReason={props.disabledReason}
              onOpen={props.onOpen}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
