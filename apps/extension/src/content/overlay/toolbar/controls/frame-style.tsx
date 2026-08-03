import { useEffect, useRef, useState } from 'react';
import { Droplet, Focus, Square } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { EffectMode } from '../../../../features/highlighter/contracts';
import { translate } from '../../../../platform/i18n';
import { FrameSettingsPopover } from '../../../selection/frame-settings-popover';
import type { ToolbarFutureFrameStyle } from '../types';
import type { ToolbarMenuState } from '../state/menu';

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
  toolbarMenuState: ToolbarMenuState;
}) {
  const [style, setStyle] = useState(props.futureFrameStyle);
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const open = props.toolbarMenuState.activeMenuType === 'frame-style';

  useEffect(() => {
    setStyle(props.futureFrameStyle);
  }, [props.futureFrameStyle]);

  const handleEffectClick = (mode: EffectMode) => {
    if (style.effectMode === mode) {
      props.toolbarMenuState.toggleMenu('frame-style');
      return;
    }

    props.toolbarMenuState.closeMenu('frame-style');
    setStyle((current) => ({ ...current, effectMode: mode }));
    props.onFutureFrameEffectModeChange(mode);
  };

  return (
    <>
      {(['border', 'blur', 'focus'] as const).map((mode) => {
        const active = style.effectMode === mode;
        const label = getEffectLabel(mode);
        return (
          <ContentToolbarButton
            key={mode}
            ref={active ? activeButtonRef : undefined}
            active={active}
            dataUi={`content.toolbar.future-frame-${mode}`}
            menuIndicator
            title={label + (active ? translate('content.interactiveFrame.effectActiveSuffix') : '')}
            aria-pressed={active}
            aria-expanded={active && open}
            onClick={(event) => {
              event.stopPropagation();
              handleEffectClick(mode);
            }}
          >
            <FrameEffectIcon mode={mode} />
          </ContentToolbarButton>
        );
      })}

      <FrameSettingsPopover
        anchorEl={activeButtonRef.current}
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
        scope="session"
      />
    </>
  );
}
