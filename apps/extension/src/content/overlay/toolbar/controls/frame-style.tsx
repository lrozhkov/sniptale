import { useEffect, useState } from 'react';
import { Droplet, Focus, Square } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { EffectMode } from '../../../../features/highlighter/contracts';
import { translate } from '../../../../platform/i18n';
import { FrameSettingsPopover } from '../../../selection/frame-settings-popover';
import type {
  ToolbarFutureFrameCalloutActions,
  ToolbarFutureFrameStepBadgeActions,
  ToolbarFutureFrameStyle,
} from '../types';
import type { ToolbarMenuState } from '../state/menu';
import { FutureCalloutControl } from './future-callout-control';
import { FutureStepBadgeControl } from './future-step-badge-control';

const FUTURE_FRAME_ID = 'future-frame-style';
const EMPTY_FRAME_RECT = { x: 0, y: 0, width: 0, height: 0 };

function FrameEffectIcon(props: { mode: EffectMode }) {
  if (props.mode === 'border') return <Square size={18} />;
  if (props.mode === 'blur') return <Droplet size={18} />;
  return <Focus size={18} />;
}

function getEffectLabel(mode: EffectMode): string {
  if (mode === 'border') return translate('content.interactiveFrame.effectBorder');
  if (mode === 'blur') return translate('content.interactiveFrame.effectBlur');
  return translate('content.interactiveFrame.effectFocus');
}

export function FutureFrameStyleControls(props: {
  compactMenus?: boolean;
  futureFrameStyle: ToolbarFutureFrameStyle;
  onFutureFrameEffectModeChange: (mode: EffectMode) => void;
  futureFrameCalloutActions?: ToolbarFutureFrameCalloutActions;
  futureFrameStepBadgeActions?: ToolbarFutureFrameStepBadgeActions;
  toolbarMenuState: ToolbarMenuState;
}) {
  const [style, setStyle] = useState(props.futureFrameStyle);
  const [effectAnchorEl, setEffectAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = props.toolbarMenuState.activeMenuType === 'frame-style';

  useEffect(() => {
    setStyle(props.futureFrameStyle);
  }, [props.futureFrameStyle]);

  const handleEffectModeChange = (mode: EffectMode) => {
    setStyle((current) => ({ ...current, effectMode: mode }));
    props.onFutureFrameEffectModeChange(mode);
  };

  return (
    <>
      <div
        className="sniptale-toolbar-subgroup"
        data-ui="content.toolbar.future-frame-effects-group"
      >
        <ContentToolbarButton
          active
          aria-expanded={open}
          aria-pressed
          dataUi="content.toolbar.future-frame-style"
          menuIndicator
          onClick={(event) => {
            event.stopPropagation();
            setEffectAnchorEl(event.currentTarget);
            props.toolbarMenuState.toggleMenu('frame-style');
          }}
          title={getEffectLabel(style.effectMode)}
        >
          <FrameEffectIcon mode={style.effectMode} />
        </ContentToolbarButton>
      </div>

      <FrameSettingsPopover
        anchorEl={effectAnchorEl}
        blurSettings={style.blurSettings}
        borderSettings={style.borderSettings}
        compact={props.compactMenus ?? false}
        effectMode={style.effectMode}
        focusSettings={style.focusSettings}
        frameId={FUTURE_FRAME_ID}
        frameRect={EMPTY_FRAME_RECT}
        isOpen={open}
        onApplyToFrame={(patch) => setStyle((current) => ({ ...current, ...patch }))}
        onClose={() => props.toolbarMenuState.closeMenu('frame-style')}
        onEffectModeChange={handleEffectModeChange}
        scope="session"
      />

      {props.futureFrameCalloutActions || props.futureFrameStepBadgeActions ? (
        <div
          className="sniptale-toolbar-subgroup sniptale-toolbar-annotation-group"
          data-ui="content.toolbar.future-frame-annotations-group"
        >
          {props.futureFrameCalloutActions ? (
            <FutureCalloutControl
              actions={props.futureFrameCalloutActions}
              menu={props.toolbarMenuState}
              setStyle={setStyle}
              style={style}
            />
          ) : null}
          {props.futureFrameStepBadgeActions ? (
            <FutureStepBadgeControl
              actions={props.futureFrameStepBadgeActions}
              menu={props.toolbarMenuState}
              setStyle={setStyle}
              style={style}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
