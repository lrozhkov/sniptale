import { reviewTrackTitleKeys } from './track-items';
import type { RefObject } from 'react';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import { translate } from '../../platform/i18n';
import { useEffect, useRef, useState } from 'react';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewSelection } from '../../features/video/review/types';

type Section =
  | 'project'
  | 'track'
  | 'scene'
  | 'selected'
  | 'comments'
  | 'export'
  | 'history'
  | 'preview'
  | 'speech'
  | 'text';
type ReviewInspectorNavigationInput = {
  beforeAction?: ReviewBeforeAction | undefined;
  contextKey?: string;
  contextSelection?: ReviewSelection;
  selectionLabel?: string | undefined;
  settingsAvailable?: boolean;
  exportAvailable: boolean;
  recordingAvailable?: boolean;
  /** Existing explicit-open command ticket; never used as the visible-panel authority. */
  exportRequest?: number;
};

/** Owns transient inspector navigation and the scroll reset for each explicit view change. */
export function useReviewInspectorNavigation(props: ReviewInspectorNavigationInput) {
  const [recordingShown, showRecording] = useState(true);
  useEffect(() => {
    if (!props.recordingAvailable) showRecording(true);
  }, [props.recordingAvailable]);
  const contextKey = props.contextKey ?? 'comments';
  const contextSection: Section = contextKey.startsWith('comments')
    ? 'comments'
    : props.selectionLabel
      ? 'selected'
      : props.settingsAvailable
        ? 'track'
        : 'project';
  const [context, updateContext] = useState<
    'selected' | 'export' | 'history' | 'speech' | 'text' | null
  >(props.selectionLabel ? 'selected' : null);
  const [section, updateSection] = useState<Section>(
    props.selectionLabel ? contextSection : 'project'
  );
  const explicitSection = useRef<Section | null>(null);
  const previewReturn = useRef<{
    section: Section;
    context: typeof context;
    trigger?: HTMLElement;
  } | null>(null);
  const openPreview = (trigger?: HTMLElement) => {
    if (!previewReturn.current)
      previewReturn.current = { section, context, ...(trigger ? { trigger } : {}) };
    explicitSection.current = 'preview';
    updateSection('preview');
  };
  const closePreview = () => {
    const previous = previewReturn.current;
    if (!previous) return;
    previewReturn.current = null;
    explicitSection.current = previous.section;
    updateSection(previous.section);
    updateContext(previous.context);
    if (previous.trigger?.isConnected) previous.trigger.focus({ preventScroll: true });
  };
  const setSection = (value: Section) => {
    if (value === 'preview') {
      openPreview();
      return;
    }
    (props.beforeAction ?? ((action) => action()))(() => {
      previewReturn.current = null;
      if (props.recordingAvailable) showRecording(false);
      explicitSection.current = value === section ? null : value;
      if (value === 'project' || value === 'track') updateContext(null);
      else if (
        value === 'export' ||
        value === 'selected' ||
        value === 'history' ||
        value === 'speech' ||
        value === 'text'
      )
        updateContext(value);
      else
        updateContext((current) =>
          current === 'text' || current === 'speech'
            ? props.selectionLabel
              ? 'selected'
              : null
            : current
        );
      updateSection(value);
    });
  };
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [contextKey, section]);
  const previousSettings = useRef(props.settingsAvailable);
  const previousExportRequest = useRef(0);
  const exportAvailable = props.exportAvailable;
  useEffect(() => {
    const modeChanged = previousSettings.current !== props.settingsAvailable;
    previousSettings.current = props.settingsAvailable;
    const exportRequested = previousExportRequest.current !== (props.exportRequest ?? 0);
    previousExportRequest.current = props.exportRequest ?? 0;
    const explicit = explicitSection.current;
    explicitSection.current = null;
    if (previewReturn.current && !explicit) previewReturn.current = null;
    const preserveExport =
      !modeChanged &&
      props.contextSelection?.kind === 'none' &&
      !contextKey.startsWith('comments:');
    if (exportRequested && exportAvailable) updateContext('export');
    else if (!explicit)
      updateContext((current) =>
        (preserveExport && current === 'export') ||
        ((current === 'history' ||
          ((current === 'speech' || current === 'text') && !modeChanged)) &&
          props.contextSelection?.kind === 'none')
          ? current
          : contextSection === 'selected'
            ? 'selected'
            : null
      );
    updateSection((current) =>
      exportRequested && exportAvailable
        ? 'export'
        : (explicit ??
          (((current === 'project' || current === 'track') &&
            props.contextSelection?.kind === 'none' &&
            !contextKey.startsWith('comments:')) ||
          (preserveExport && current === 'export') ||
          ((current === 'history' ||
            ((current === 'speech' || current === 'text') && !modeChanged)) &&
            props.contextSelection?.kind === 'none') ||
          (!modeChanged && contextSection === 'track' && current === 'comments')
            ? current
            : contextSection))
    );
  }, [
    contextKey,
    contextSection,
    props.settingsAvailable,
    props.contextSelection,
    props.exportRequest,
    exportAvailable,
  ]);
  useEffect(() => {
    explicitSection.current = null;
  });
  const shown =
    section === 'selected' && !props.selectionLabel
      ? props.settingsAvailable
        ? 'track'
        : 'project'
      : (section === 'scene' || section === 'text') && !props.settingsAvailable
        ? 'comments'
        : section;
  return {
    recordingShown,
    openRecording: () => showRecording(true),
    shown,
    context,
    setSection,
    openPreview,
    closePreview,
    scroll,
  };
}

export type ReviewInspectorNavigation = ReturnType<typeof useReviewInspectorNavigation>;

type TrackViewSnapshot = Readonly<{ tab: 'list' | 'settings'; section?: string }>;

/** Mounted inspector preferences publish only to their local consumers, never to the editor root. */
export function createReviewInspectorTrackView(
  beforeAction: ReviewBeforeAction = (action) => action()
) {
  const initial: TrackViewSnapshot = { tab: 'list' };
  const lanes = new Map<QuickEditTrack, TrackViewSnapshot>();
  const listeners = new Set<() => void>();
  const read = (track: QuickEditTrack) => lanes.get(track) ?? initial;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const publish = (track: QuickEditTrack, next: TrackViewSnapshot) => {
    const previous = read(track);
    if (previous.tab === next.tab && previous.section === next.section) return;
    lanes.set(track, next);
    for (const listener of listeners) listener();
  };
  const show = (track: QuickEditTrack, tab: TrackViewSnapshot['tab']) =>
    publish(track, { ...read(track), tab });
  return {
    read,
    subscribe,
    show,
    choose(track: QuickEditTrack, section: string) {
      const previous = read(track);
      const tab = section === 'list' ? 'list' : 'settings';
      const next: TrackViewSnapshot = section === 'list' ? { ...previous, tab } : { tab, section };
      if (previous.tab === next.tab && previous.section === next.section) return;
      const apply = () => publish(track, next);
      if (previous.tab === tab) apply();
      else beforeAction(apply);
    },
    sourceSettings: {
      read: () => read('source').tab === 'settings',
      subscribe,
    },
  };
}

export type ReviewInspectorTrackView = ReturnType<typeof createReviewInspectorTrackView>;

/** Timeline commands use the same exclusive third context as direct inspector navigation. */
export function reviewTimelineInspectorCommands(args: {
  video: { current: Pick<HTMLVideoElement, 'pause'> | null };
  pause?: (() => void) | undefined;
  select(selection: ReviewSelection): void;
  navigation: Pick<ReviewInspectorNavigation, 'setSection' | 'shown'>;
  selectedTextId: string | undefined;
  selection?: ReviewSelection;
  requestExport(update: (current: number) => number): void;
}) {
  const clearSelection = () => {
    (args.pause ?? (() => args.video.current?.pause()))();
    args.select({ kind: 'none' });
  };
  return {
    selectedTextId: args.selectedTextId,
    selectedAnnotationEffectId:
      args.selection?.kind === 'annotation-effect' ? args.selection.id : null,
    selectedTelemetryRef: args.selection?.kind === 'telemetry' ? args.selection.ref : undefined,
    selectedCursorFocusId: args.selection?.kind === 'cursor-focus' ? args.selection.id : undefined,
    onSelectAnnotationEffect: (id: string) => args.select({ kind: 'annotation-effect', id }),
    exportActive: args.navigation.shown === 'export',
    onSelectText: (id: string) => {
      (args.pause ?? (() => args.video.current?.pause()))();
      args.select({ kind: 'text', id });
      args.navigation.setSection('selected');
    },
    onOpenText: () => {
      clearSelection();
      args.navigation.setSection('text');
    },
    onOpenSpeech: () => {
      clearSelection();
      args.navigation.setSection('speech');
    },
    onOpenHistory: () => args.navigation.setSection('history'),
    onOpenExport: () => args.requestExport((current) => current + 1),
  };
}

/** Tracks the lane root used by Back; editor commands retain mutation and admission authority. */
export function useReviewInspectorTrackNavigation(props: {
  navigation: Pick<ReviewInspectorNavigation, 'shown' | 'setSection'>;
  selection: ReviewSelection;
  beforeAction: ReviewBeforeAction;
  cancelAnnotation: RefObject<(() => void) | null>;
  setDrawing(value: boolean): void;
  setCutting(value: false): void;
  setAudioTool(value: boolean): void;
  setAudioRange(value: boolean): void;
  select(value: ReviewSelection): void;
}) {
  const [inspectorTrack, setTrack] = useState<QuickEditTrack>('source');
  const admission = useRef(props.beforeAction);
  admission.current = props.beforeAction;
  const [view] = useState(() =>
    createReviewInspectorTrackView((action) => admission.current(action))
  );
  const navigation = props.navigation;
  const resetSelection = () => {
    props.cancelAnnotation.current?.();
    props.setDrawing(false);
    props.setCutting(false);
    props.setAudioTool(false);
    props.setAudioRange(false);
    if (props.selection.kind !== 'none') props.select({ kind: 'none' });
  };
  const openProject = () =>
    props.beforeAction(() => {
      resetSelection();
      setTrack('source');
      view.show('source', 'settings');
      navigation.setSection('track');
    });
  const trackSection =
    inspectorTrack === 'originalAudio'
      ? 'speech'
      : inspectorTrack === 'text'
        ? 'text'
        : inspectorTrack === 'actions' ||
            inspectorTrack === 'keyboard' ||
            inspectorTrack === 'mouse'
          ? 'history'
          : 'track';
  const atTrackRoot = navigation.shown === trackSection;
  const backLabel = translate(
    atTrackRoot ? 'gallery.videoReview.aboutProject' : reviewTrackTitleKeys[inspectorTrack]
  );
  const backToTrack = () =>
    props.beforeAction(() => {
      resetSelection();
      view.show(inspectorTrack, 'list');
      navigation.setSection(trackSection);
    });
  const openTrack = (track: QuickEditTrack) =>
    props.beforeAction(() => {
      setTrack(track);
      resetSelection();
      navigation.setSection('track');
    });
  return {
    track: inspectorTrack,
    view,
    setTrack,
    openTrack,
    back: backToTrack,
    backLabel,
    openProject,
  };
}
