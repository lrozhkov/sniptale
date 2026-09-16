import type { TourPlayerLabels } from '../../../features/scenario/tour-player/public';
import type { Translate } from '../../../platform/i18n';

/** One translated vocabulary for authoring and exported playback. */
export function tourPlayerLabels(t: Translate): TourPlayerLabels {
  return {
    audioBlocked: t('scenario.editor.tourHtmlAudioBlocked'),
    resize: t('scenario.editor.tourResizeArea'),
    expand: t('scenario.editor.tourExpandCaption'),
    collapse: t('scenario.editor.tourCollapseCaption'),
    previous: t('scenario.editor.tourHintPrevious'),
    next: t('scenario.editor.tourHintNext'),
    contents: t('scenario.editor.tourSlides'),
    close: t('scenario.editor.close'),
    restart: t('scenario.editor.tourRestart'),
    finished: t('scenario.editor.tourEnd'),
    empty: t('scenario.editor.tourImageEmpty'),
    point: t('scenario.editor.tourHotspot'),
    details: t('scenario.editor.tourAnnotation'),
    play: t('scenario.editor.tourPlay'),
    pause: t('scenario.editor.tourPause'),
    seek: t('scenario.editor.tourSeek'),
    retry: t('scenario.editor.tourRetry'),
    loading: t('scenario.editor.tourLoading'),
    mediaError: t('scenario.editor.tourMediaError'),
    choose: t('scenario.editor.tourChooseDestination'),
  };
}
