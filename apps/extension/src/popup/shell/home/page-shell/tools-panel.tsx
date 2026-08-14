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
import { translate, type TranslationKey } from '../../../../platform/i18n/popup';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';

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

export function ScreenshotToolsPanel(props: {
  disabledReason: string | null;
  onOpen(mode?: ToolbarWorkingMode): void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1 pt-1">
      <div className="grid gap-1.5">
        {tools.map((tool) => {
          const label = translate(tool.labelKey);
          const hint = translate(tool.hintKey);
          return (
            <PopupActionButton
              key={tool.dataUi}
              icon={tool.icon}
              label={label}
              iconClassName="text-[var(--sniptale-color-accent)]"
              dataUi={tool.dataUi}
              disabled={Boolean(props.disabledReason)}
              title={props.disabledReason ?? hint}
              onClick={() => props.onOpen(tool.mode)}
            />
          );
        })}
      </div>
    </div>
  );
}
