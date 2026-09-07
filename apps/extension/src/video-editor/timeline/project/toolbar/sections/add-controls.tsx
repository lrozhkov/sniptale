import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGlassSelectLayout } from '@sniptale/ui/glass-select/layout';
import { isComposedEventWithinElement } from '@sniptale/ui/dom-events';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import {
  Activity,
  Check,
  MoreHorizontal,
  MousePointer2,
  Music,
  Plus,
  Rows3,
  Text,
  Video,
  ZoomIn,
} from 'lucide-react';
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

import type { useProjectTimelinePanelPrefs } from '../../panel/prefs';

interface TrackDisplayOptions {
  trackPanelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
  hasCursor: boolean;
  hasTelemetry: boolean;
}

const TRACK_MENU_OPTIONS = [
  {
    icon: <Video size={14} strokeWidth={2.1} />,
    hintKey: 'videoEditor.timeline.addVideoTrackNote',
    kind: VideoTrackKind.PRIMARY,
    labelKey: 'videoEditor.timeline.addVideoTrack',
  },
  {
    icon: <Music size={14} strokeWidth={2.1} />,
    hintKey: 'videoEditor.timeline.addAudioTrackNote',
    kind: VideoTrackKind.AUDIO,
    labelKey: 'videoEditor.timeline.addAudioTrack',
  },
] as const;

export function ProjectTimelineAddControls(props: {
  insertion: ProjectTimelineInsertionActions;
  canAddMotionRegion: boolean;
}) {
  return (
    <div className="flex min-w-0 shrink-0 flex-nowrap items-center gap-1">
      <ContentToolbarButton
        type="button"
        disabled={!props.canAddMotionRegion}
        onClick={() => props.insertion.onAddMotionRegion()}
        className={toolbarButtonClassName}
        title={translate('videoEditor.timeline.addZoomRegion')}
        dataUi="video-editor.timeline.toolbar.add-zoom"
      >
        <ZoomIn size={14} strokeWidth={2} />
        <span className="@max-[1600px]/timeline:sr-only">
          {translate('videoEditor.timeline.addZoomRegion')}
        </span>
      </ContentToolbarButton>
    </div>
  );
}

export function ProjectTimelineAddTrackControl(props: {
  onAddTrack: ProjectTimelineInsertionActions['onAddTrack'];
  displayOptions?: TrackDisplayOptions;
}) {
  const trackChoices = useTrackChoicesMenuState();
  return (
    <div ref={trackChoices.menuRootRef} className="relative">
      <ContentToolbarButton
        ref={trackChoices.triggerRef}
        type="button"
        onClick={trackChoices.toggle}
        className="!h-6 !w-6 !min-w-6 !p-0"
        title={translate(
          props.displayOptions
            ? 'videoEditor.timeline.tracksTitle'
            : 'videoEditor.timeline.addTrack'
        )}
        aria-expanded={trackChoices.visible}
        dataUi="video-editor.timeline.toolbar.add-track"
      >
        {props.displayOptions ? <MoreHorizontal size={14} /> : <Plus size={14} strokeWidth={2} />}
        <span className="sr-only">
          {translate(
            props.displayOptions
              ? 'videoEditor.timeline.tracksTitle'
              : 'videoEditor.timeline.addTrack'
          )}
        </span>
      </ContentToolbarButton>
      {trackChoices.visible
        ? createPortal(
            <div
              ref={trackChoices.menuRef}
              style={{ ...trackChoices.portalStyle, width: 280 }}
              data-theme={trackChoices.theme ?? undefined}
              data-ui="video-editor.timeline.toolbar.add-track.choices"
            >
              <TrackKindChoiceGroup
                onAddTrack={props.onAddTrack}
                onClose={trackChoices.close}
                {...(props.displayOptions ? { displayOptions: props.displayOptions } : {})}
              />
            </div>,
            resolveThemeSafePortalTarget(trackChoices.triggerRef.current)
          )
        : null}
    </div>
  );
}

function useTrackChoicesMenuState() {
  const [visible, setVisible] = useState(false);
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = useCallback((restoreFocus = false) => {
    setVisible(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);
  const { portalStyle } = useGlassSelectLayout({
    portal: true,
    isOpen: visible,
    containerRef: menuRootRef,
    menuRef,
  });
  useEffect(() => {
    if (!visible) return;
    const dismissOutside = (event: PointerEvent) => {
      if (
        !isComposedEventWithinElement(event, menuRootRef.current) &&
        !isComposedEventWithinElement(event, menuRef.current)
      ) {
        if (document.activeElement === triggerRef.current) triggerRef.current?.blur();
        close();
      }
    };
    const dismissKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('keydown', dismissKeyboard);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('keydown', dismissKeyboard);
    };
  }, [visible, close]);
  const theme = useResolvedPortalTheme(triggerRef.current);
  useEffect(() => {
    if (!visible) return;
    const timeline = menuRootRef.current?.closest('[data-ui="video-editor.timeline.surface"]');
    if (!timeline) return;
    const width = timeline.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      if (timeline.getBoundingClientRect().width !== width) close(true);
    });
    observer.observe(timeline);
    return () => observer.disconnect();
  }, [visible, close]);
  return {
    close,
    menuRootRef,
    menuRef,
    portalStyle,
    theme,
    triggerRef,
    toggle: () => setVisible((open) => !open),
    visible,
  };
}

function TrackKindChoiceGroup(props: {
  onAddTrack: ProjectTimelineInsertionActions['onAddTrack'];
  onClose: (restoreFocus?: boolean) => void;
  displayOptions?: TrackDisplayOptions;
}) {
  return (
    <ProductToolbarMenu
      compact
      className="overflow-hidden rounded-xl"
      style={{
        position: 'relative',
        top: 'auto',
        left: 'auto',
        width: '100%',
        minWidth: 0,
        animation: 'none',
      }}
      title={translate(
        props.displayOptions
          ? 'videoEditor.timeline.tracksTitle'
          : 'videoEditor.timeline.addTrackMenuTitle'
      )}
    >
      {props.displayOptions ? (
        <TrackDisplayChoices options={props.displayOptions} onClose={props.onClose} />
      ) : null}
      {TRACK_MENU_OPTIONS.map((option) => (
        <ProductToolbarMenuItem
          key={option.kind}
          type="button"
          dataUi={`video-editor.timeline.toolbar.add-track.${option.kind.toLowerCase()}`}
          onClick={() => {
            props.onAddTrack(option.kind);
            props.onClose(true);
          }}
        >
          {option.icon}
          <ProductToolbarMenuItemCopy
            hint={translate(option.hintKey)}
            label={translate(option.labelKey)}
            showHintInCompact
          />
        </ProductToolbarMenuItem>
      ))}
    </ProductToolbarMenu>
  );
}

function TrackDisplayChoices({
  options,
  onClose,
}: {
  options: TrackDisplayOptions;
  onClose: (restoreFocus?: boolean) => void;
}) {
  const { trackPanelPrefs: state } = options;
  const choices = [
    {
      key: 'hideTrackNames',
      icon: <Text size={14} />,
      selected: state.prefs.hideTrackNames,
      disabled: false,
      apply: () => state.setHideTrackNames(!state.prefs.hideTrackNames),
    },
    {
      key: 'trackPanelCompactToggle',
      icon: <Rows3 size={14} />,
      selected: state.prefs.compactRows,
      disabled: false,
      apply: () => state.setCompactRows(!state.prefs.compactRows),
    },
    {
      key: 'cursorLane',
      icon: <MousePointer2 size={14} />,
      selected: options.hasCursor && state.prefs.collapsedCursorLaneVisible,
      disabled: !options.hasCursor,
      apply: () => state.setCollapsedCursorLaneVisible(!state.prefs.collapsedCursorLaneVisible),
    },
    {
      key: 'telemetryLane',
      icon: <Activity size={14} />,
      selected: options.hasTelemetry && state.prefs.collapsedTelemetryLaneVisible,
      disabled: !options.hasTelemetry,
      apply: () =>
        state.setCollapsedTelemetryLaneVisible(!state.prefs.collapsedTelemetryLaneVisible),
    },
  ] as const;
  return (
    <div className="border-b border-[color:var(--sniptale-color-border-soft)] pb-1 mb-1">
      {choices.map((choice) => (
        <ProductToolbarMenuItem
          key={choice.key}
          selected={choice.selected}
          disabled={choice.disabled}
          onClick={() => {
            onClose(true);
            choice.apply();
          }}
        >
          {choice.icon}
          <ProductToolbarMenuItemCopy label={translate(`videoEditor.timeline.${choice.key}`)} />
          {choice.selected ? <Check size={14} aria-hidden="true" /> : null}
        </ProductToolbarMenuItem>
      ))}
    </div>
  );
}
