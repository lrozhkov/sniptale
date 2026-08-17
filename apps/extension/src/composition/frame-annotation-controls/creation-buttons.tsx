import { ChevronDown, Droplet, Focus, ListOrdered, Square } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { ReactNode, RefObject } from 'react';
import { FrameCommentIcon } from '../../features/highlighter/frame-annotation/icons';
import type { EffectMode } from '../../features/highlighter/contracts';
import { translate } from '../../platform/i18n';
import type { FrameAnnotationCreationMenu, FrameAnnotationCreationSettings } from './contracts';

function CreationSplitButton(props: {
  active: boolean;
  children: ReactNode;
  dataUi: string;
  disabled?: boolean;
  menuOpen: boolean;
  menuRef: RefObject<HTMLButtonElement | null>;
  onMenuClick: () => void;
  onToggle: () => void;
  title: string;
}) {
  return (
    <div
      className="sniptale-split-action sniptale-full-page-wrapper"
      data-active={props.active ? 'true' : 'false'}
    >
      <ContentToolbarButton
        active={props.active}
        aria-pressed={props.active}
        className="sniptale-split-action-start sniptale-full-page-primary"
        dataUi={props.dataUi}
        disabled={props.disabled ?? false}
        onClick={(event) => {
          event.stopPropagation();
          props.onToggle();
        }}
        title={props.title}
      >
        {props.children}
      </ContentToolbarButton>
      <ContentToolbarButton
        ref={props.menuRef}
        aria-expanded={props.menuOpen}
        aria-haspopup="menu"
        className="sniptale-split-action-end sniptale-full-page-chevron"
        dataUi={`${props.dataUi}.menu`}
        disabled={props.disabled ?? false}
        onClick={(event) => {
          event.stopPropagation();
          props.onMenuClick();
        }}
        title={props.title}
      >
        <ChevronDown size={14} />
      </ContentToolbarButton>
    </div>
  );
}

export function FrameStyleCreationButton(props: {
  activeMenu: FrameAnnotationCreationMenu | null;
  contentContext: boolean;
  dataUi?: string;
  disabled?: boolean;
  frameActive: boolean;
  frameRef: RefObject<HTMLButtonElement | null>;
  onToggleFrame: () => void;
  settings: FrameAnnotationCreationSettings;
  toggle: (menu: FrameAnnotationCreationMenu) => void;
}) {
  const dataUi = props.contentContext
    ? 'content.toolbar.future-frame-style'
    : 'frame-annotation.creation.frame';
  return (
    <div
      className="sniptale-toolbar-subgroup"
      data-ui={
        props.contentContext
          ? 'content.toolbar.future-frame-effects-group'
          : (props.dataUi ?? 'frame-annotation.creation-controls')
      }
    >
      <CreationSplitButton
        active={props.frameActive}
        dataUi={dataUi}
        disabled={props.disabled ?? false}
        menuOpen={props.activeMenu === 'frame'}
        menuRef={props.frameRef}
        onMenuClick={() => props.toggle('frame')}
        onToggle={props.onToggleFrame}
        title={getEffectLabel(props.settings.effectMode)}
      >
        <FrameEffectIcon mode={props.settings.effectMode} />
      </CreationSplitButton>
    </div>
  );
}

export function AnnotationCreationButtons(props: {
  activeMenu: FrameAnnotationCreationMenu | null;
  calloutRef: RefObject<HTMLButtonElement | null>;
  contentContext: boolean;
  disabled?: boolean;
  onCalloutMenu: () => void;
  onStepBadgeMenu: () => void;
  onToggleCallout: () => void;
  onToggleStepBadge: () => void;
  settings: FrameAnnotationCreationSettings;
  showCallout: boolean;
  showStepBadge: boolean;
  stepBadgeRef: RefObject<HTMLButtonElement | null>;
}) {
  const calloutActive = props.settings.callout !== null && props.settings.callout.enabled !== false;
  const stepBadgeActive =
    props.settings.stepBadge !== null && props.settings.stepBadge.enabled !== false;
  return (
    <div
      className="sniptale-toolbar-subgroup sniptale-toolbar-annotation-group"
      data-ui={
        props.contentContext
          ? 'content.toolbar.future-frame-annotations-group'
          : 'frame-annotation.creation-annotations'
      }
    >
      {props.showCallout ? (
        <CreationSplitButton
          active={calloutActive}
          dataUi={
            props.contentContext
              ? 'content.toolbar.future-frame-callout'
              : 'frame-annotation.creation.callout'
          }
          disabled={props.disabled ?? false}
          menuOpen={props.activeMenu === 'callout'}
          menuRef={props.calloutRef}
          onMenuClick={props.onCalloutMenu}
          onToggle={props.onToggleCallout}
          title={translate('content.callout.settingsTitle')}
        >
          <FrameCommentIcon size={18} />
        </CreationSplitButton>
      ) : null}
      {props.showStepBadge ? (
        <CreationSplitButton
          active={stepBadgeActive}
          dataUi={
            props.contentContext
              ? 'content.toolbar.future-frame-step-badge'
              : 'frame-annotation.creation.step-badge'
          }
          disabled={props.disabled ?? false}
          menuOpen={props.activeMenu === 'step-badge'}
          menuRef={props.stepBadgeRef}
          onMenuClick={props.onStepBadgeMenu}
          onToggle={props.onToggleStepBadge}
          title={translate('content.stepBadge.settingsTitle')}
        >
          <ListOrdered size={18} />
        </CreationSplitButton>
      ) : null}
    </div>
  );
}

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
