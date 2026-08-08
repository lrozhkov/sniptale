import { Droplet, Focus, ListOrdered, Square } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { RefObject } from 'react';
import { FrameCommentIcon } from '../../features/highlighter/frame-annotation/icons';
import type { EffectMode } from '../../features/highlighter/contracts';
import { translate } from '../../platform/i18n';
import type { FrameAnnotationCreationMenu, FrameAnnotationCreationSettings } from './contracts';

export function FrameStyleCreationButton(props: {
  activeMenu: FrameAnnotationCreationMenu | null;
  contentContext: boolean;
  dataUi?: string;
  frameRef: RefObject<HTMLButtonElement | null>;
  settings: FrameAnnotationCreationSettings;
  toggle: (menu: FrameAnnotationCreationMenu) => void;
}) {
  return (
    <div
      className="sniptale-toolbar-subgroup"
      data-ui={
        props.contentContext
          ? 'content.toolbar.future-frame-effects-group'
          : (props.dataUi ?? 'frame-annotation.creation-controls')
      }
    >
      <ContentToolbarButton
        ref={props.frameRef}
        active
        aria-expanded={props.activeMenu === 'frame'}
        aria-pressed
        dataUi={
          props.contentContext
            ? 'content.toolbar.future-frame-style'
            : 'frame-annotation.creation.frame'
        }
        menuIndicator
        onClick={(event) => {
          event.stopPropagation();
          props.toggle('frame');
        }}
        title={getEffectLabel(props.settings.effectMode)}
      >
        <FrameEffectIcon mode={props.settings.effectMode} />
      </ContentToolbarButton>
    </div>
  );
}

export function AnnotationCreationButtons(props: {
  activeMenu: FrameAnnotationCreationMenu | null;
  calloutRef: RefObject<HTMLButtonElement | null>;
  contentContext: boolean;
  enableCallout: () => void;
  enableStepBadge: () => void;
  settings: FrameAnnotationCreationSettings;
  showCallout: boolean;
  showStepBadge: boolean;
  stepBadgeRef: RefObject<HTMLButtonElement | null>;
  toggle: (menu: FrameAnnotationCreationMenu) => void;
}) {
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
        <ContentToolbarButton
          ref={props.calloutRef}
          active={props.settings.callout != null}
          aria-expanded={props.activeMenu === 'callout'}
          aria-pressed={props.settings.callout != null}
          dataUi={
            props.contentContext
              ? 'content.toolbar.future-frame-callout'
              : 'frame-annotation.creation.callout'
          }
          menuIndicator
          onClick={(event) => {
            event.stopPropagation();
            if (props.settings.callout) props.toggle('callout');
            else props.enableCallout();
          }}
          title={translate('content.callout.settingsTitle')}
        >
          <FrameCommentIcon size={18} />
        </ContentToolbarButton>
      ) : null}
      {props.showStepBadge ? (
        <ContentToolbarButton
          ref={props.stepBadgeRef}
          active={props.settings.stepBadge != null}
          aria-expanded={props.activeMenu === 'step-badge'}
          aria-pressed={props.settings.stepBadge != null}
          dataUi={
            props.contentContext
              ? 'content.toolbar.future-frame-step-badge'
              : 'frame-annotation.creation.step-badge'
          }
          menuIndicator
          onClick={(event) => {
            event.stopPropagation();
            if (props.settings.stepBadge) props.toggle('step-badge');
            else props.enableStepBadge();
          }}
          title={translate('content.stepBadge.settingsTitle')}
        >
          <ListOrdered size={18} />
        </ContentToolbarButton>
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
