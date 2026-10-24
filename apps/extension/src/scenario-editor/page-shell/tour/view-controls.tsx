import { useLayoutEffect, useRef, useState } from 'react';
import { Play, ScanSearch, SkipBack } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import type { Translate } from '../../../platform/i18n';
import type { TourSelection } from './selection';

type TourView = 'edit' | 'frame' | 'preview';

export type TourViewMode = {
  view: TourView;
  replay: number;
  previewOrigin: 'selection' | 'beginning';
  cameraAvailable: boolean;
  preview(): void;
  previewBeginning(): void;
  replayPreview(): void;
  edit(): void;
  toggleFrame(): void;
};

/** The disposable view mode lives beside the selection owner and never enters project history. */
export function useTourViewMode(
  selection: TourSelection | null,
  slide: TourSlide | null
): TourViewMode {
  const selectionKey =
    selection?.kind === 'slide' ? selection.slideId : selection?.kind === 'end' ? 'end' : null;
  const [requested, setRequested] = useState<{
    key: string | null;
    view: TourView;
    replay: number;
    previewOrigin: 'selection' | 'beginning';
  }>({ key: selectionKey, view: 'edit', replay: 0, previewOrigin: 'selection' });
  const current =
    requested.key === selectionKey
      ? requested
      : {
          key: selectionKey,
          view: 'edit' as const,
          replay: 0,
          previewOrigin: 'selection' as const,
        };
  const selectedAction =
    slide?.kind === 'image' && selection?.kind === 'slide'
      ? slide.actions.find((entry) => entry.object.id === selection.objectId)
      : undefined;
  const camera = selectedAction?.object.camera ?? (slide?.kind === 'image' ? slide.camera : null);
  const cameraAvailable =
    slide?.kind === 'image' && Boolean(slide.image) && camera?.mode === 'manual';
  const view: TourView = current.view === 'frame' && !cameraAvailable ? 'edit' : current.view;
  const set = (next: TourView, replay = current.replay, previewOrigin = current.previewOrigin) =>
    setRequested({ key: selectionKey, view: next, replay, previewOrigin });
  return {
    view,
    replay: current.replay,
    previewOrigin: current.previewOrigin,
    cameraAvailable,
    preview: () => set('preview', current.replay, 'selection'),
    previewBeginning: () => set('preview', current.replay, 'beginning'),
    replayPreview: () => set('preview', current.replay + 1),
    edit: () => set('edit'),
    toggleFrame: () => set(view === 'frame' ? 'edit' : 'frame'),
  };
}

/** Header projection of the view mode: editing is the default, preview owns Return and Replay. */
export function TourViewControls({
  mode,
  previewDisabled = false,
  beginningDisabled = previewDisabled,
  disabled = false,
  t,
}: {
  mode: TourViewMode;
  previewDisabled?: boolean;
  beginningDisabled?: boolean;
  disabled?: boolean;
  t: Translate;
}) {
  const previewButton = useRef<HTMLButtonElement>(null);
  const beginningButton = useRef<HTMLButtonElement>(null);
  const previousView = useRef(mode.view);
  useLayoutEffect(() => {
    const returning = previousView.current === 'preview' && mode.view === 'edit';
    previousView.current = mode.view;
    if (returning) {
      const origin = mode.previewOrigin === 'beginning' ? beginningButton : previewButton;
      origin.current?.focus({ preventScroll: true });
    }
  }, [mode.view, mode.previewOrigin]);
  return mode.view === 'preview' ? null : (
    <>
      <ContentToolbarButton
        className="guide-labeled-action"
        ref={previewButton}
        data-header-collapse="5"
        title={t('scenario.editor.tourPreviewSlide')}
        disabled={previewDisabled}
        onClick={mode.preview}
      >
        <Play size={16} aria-hidden="true" />
        <span>{t('scenario.editor.tourPreviewSlide')}</span>
      </ContentToolbarButton>
      <ContentToolbarButton
        className="guide-labeled-action"
        data-header-collapse="5"
        ref={beginningButton}
        title={t('scenario.editor.tourPreviewStart')}
        disabled={beginningDisabled}
        onClick={mode.previewBeginning}
      >
        <SkipBack size={16} aria-hidden="true" />
        <span>{t('scenario.editor.tourPreviewStart')}</span>
      </ContentToolbarButton>
      {mode.cameraAvailable && (
        <ContentToolbarButton
          className="guide-labeled-action"
          title={t('scenario.editor.tourCameraFrame')}
          data-header-collapse="6"
          aria-pressed={mode.view === 'frame'}
          disabled={disabled}
          onClick={mode.toggleFrame}
        >
          <ScanSearch size={16} aria-hidden="true" />
          <span>{t('scenario.editor.tourCameraFrame')}</span>
        </ContentToolbarButton>
      )}
    </>
  );
}
