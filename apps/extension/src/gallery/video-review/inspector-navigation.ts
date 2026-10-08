import { useEffect, useRef, useState } from 'react';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewSelection } from '../../features/video/review/types';

type Section = 'scene' | 'selected' | 'comments' | 'export' | 'history' | 'preview';
type ReviewInspectorNavigationInput = {
  beforeAction?: ReviewBeforeAction | undefined;
  contextKey?: string;
  contextSelection?: ReviewSelection;
  selectionLabel?: string | undefined;
  settingsAvailable?: boolean;
  exportAvailable: boolean;
  /** Existing explicit-open command ticket; never used as the visible-panel authority. */
  exportRequest?: number;
};

/** Owns transient inspector navigation and the scroll reset for each explicit view change. */
export function useReviewInspectorNavigation(props: ReviewInspectorNavigationInput) {
  const [presentation, setPresentation] = useState<'all' | 'sections'>('all');
  const contextKey = props.contextKey ?? 'comments';
  const contextSection: Section = contextKey.startsWith('comments')
    ? 'comments'
    : props.selectionLabel
      ? 'selected'
      : props.settingsAvailable
        ? 'scene'
        : 'comments';
  const [context, updateContext] = useState<'selected' | 'export' | 'history' | null>(
    props.selectionLabel ? 'selected' : null
  );
  const [section, updateSection] = useState<Section>(contextSection);
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
      explicitSection.current = value;
      if (value === 'export' || value === 'selected' || value === 'history') updateContext(value);
      updateSection(value);
    });
  };
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [contextKey, section, presentation]);
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
    const preserveExport = !modeChanged && props.contextSelection?.kind === 'none';
    if (exportRequested && exportAvailable) updateContext('export');
    else if (!explicit)
      updateContext((current) =>
        (preserveExport && current === 'export') ||
        (current === 'history' && props.contextSelection?.kind === 'none')
          ? current
          : contextSection === 'selected'
            ? 'selected'
            : null
      );
    updateSection((current) =>
      exportRequested && exportAvailable
        ? 'export'
        : (explicit ??
          ((preserveExport && current === 'export') ||
          (current === 'history' && props.contextSelection?.kind === 'none') ||
          (!modeChanged && contextSection === 'scene' && current === 'comments')
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
        ? 'scene'
        : 'comments'
      : section === 'scene' && !props.settingsAvailable
        ? 'comments'
        : section;
  return {
    presentation,
    setPresentation,
    shown,
    context,
    setSection,
    openPreview,
    closePreview,
    scroll,
  };
}

export type ReviewInspectorNavigation = ReturnType<typeof useReviewInspectorNavigation>;
