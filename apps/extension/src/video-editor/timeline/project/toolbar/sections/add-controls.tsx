import { useEffect, useRef, useState, type RefObject } from 'react';
import { Captions, ChevronDown, Music, Plus, StickyNote, Video } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { VideoTrackKind } from '../../../../../features/video/project/types';
import type { ProjectTimelineInsertionActions } from '../../types';
import { toolbarButtonClassName } from './constants/button';

const TRACK_MENU_OPTIONS = [
  {
    icon: <Video size={14} strokeWidth={2.1} />,
    kind: VideoTrackKind.PRIMARY,
    labelKey: 'videoEditor.timeline.addVideoTrack',
  },
  {
    icon: <Music size={14} strokeWidth={2.1} />,
    kind: VideoTrackKind.AUDIO,
    labelKey: 'videoEditor.timeline.addAudioTrack',
  },
  {
    icon: <StickyNote size={14} strokeWidth={2.1} />,
    kind: VideoTrackKind.OVERLAY,
    labelKey: 'videoEditor.timeline.addOverlayTrack',
  },
  {
    icon: <Captions size={14} strokeWidth={2.1} />,
    kind: VideoTrackKind.SUBTITLE,
    labelKey: 'videoEditor.timeline.addSubtitleTrack',
  },
] as const;

export function ProjectTimelineAddControls(props: { insertion: ProjectTimelineInsertionActions }) {
  const trackChoices = useTrackChoicesMenuState();

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <div ref={trackChoices.menuRootRef} className="relative">
        <ContentToolbarButton
          type="button"
          onClick={trackChoices.toggle}
          className={toolbarButtonClassName}
          title={translate('videoEditor.timeline.addTrack')}
          aria-expanded={trackChoices.visible}
          dataUi="video-editor.timeline.toolbar.add-track"
        >
          <Plus size={14} strokeWidth={2} />
          <span>{translate('videoEditor.timeline.addTrack')}</span>
          <ChevronDown size={12} strokeWidth={2.2} />
        </ContentToolbarButton>
        {trackChoices.visible ? (
          <div
            className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[14rem]"
            data-ui="video-editor.timeline.toolbar.add-track.choices"
          >
            <TrackKindChoiceGroup insertion={props.insertion} onClose={trackChoices.close} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function useTrackChoicesMenuState() {
  const [visible, setVisible] = useState(false);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    return bindTrackChoicesDismissHandlers(menuRootRef, () => setVisible(false));
  }, [visible]);

  return {
    close: () => setVisible(false),
    menuRootRef,
    toggle: () => setVisible((open) => !open),
    visible,
  };
}

function bindTrackChoicesDismissHandlers(
  menuRootRef: RefObject<HTMLDivElement | null>,
  close: () => void
) {
  const closeMenu = (event: PointerEvent) => {
    if (!menuRootRef.current?.contains(event.target as Node)) {
      close();
    }
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      close();
    }
  };

  document.addEventListener('pointerdown', closeMenu);
  document.addEventListener('keydown', closeOnEscape);
  return () => {
    document.removeEventListener('pointerdown', closeMenu);
    document.removeEventListener('keydown', closeOnEscape);
  };
}

function TrackKindChoiceGroup(props: {
  insertion: ProjectTimelineInsertionActions;
  onClose: () => void;
}) {
  return (
    <ProductToolbarMenu compact title={translate('videoEditor.timeline.addTrackMenuTitle')}>
      {TRACK_MENU_OPTIONS.map((option) => (
        <ProductToolbarMenuItem
          key={option.kind}
          type="button"
          dataUi={`video-editor.timeline.toolbar.add-track.${option.kind.toLowerCase()}`}
          onClick={() => {
            props.insertion.onAddTrack(option.kind);
            props.onClose();
          }}
        >
          {option.icon}
          <ProductToolbarMenuItemCopy label={translate(option.labelKey)} />
        </ProductToolbarMenuItem>
      ))}
    </ProductToolbarMenu>
  );
}
