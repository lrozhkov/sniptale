import { useEffect, useRef, useState } from 'react';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewSelection } from '../../features/video/review/types';

type Section = 'scene' | 'selected' | 'comments' | 'export';
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
  const [context, updateContext] = useState<'selected' | 'export' | null>(
    props.selectionLabel ? 'selected' : null
  );
  const [section, updateSection] = useState<Section>(contextSection);
  const explicitSection = useRef<Section | null>(null);
  const setSection = (value: Section) => {
    (props.beforeAction ?? ((action) => action()))(() => {
      explicitSection.current = value;
      if (value === 'export' || value === 'selected') updateContext(value);
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
    if (exportRequested && exportAvailable) updateContext('export');
    else if (!explicit) updateContext(contextSection === 'selected' ? 'selected' : null);
    updateSection((current) =>
      exportRequested && exportAvailable
        ? 'export'
        : (explicit ??
          (!modeChanged && contextSection === 'scene' && current === 'comments'
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
  return { presentation, setPresentation, shown, context, setSection, scroll };
}

export type ReviewInspectorNavigation = ReturnType<typeof useReviewInspectorNavigation>;
