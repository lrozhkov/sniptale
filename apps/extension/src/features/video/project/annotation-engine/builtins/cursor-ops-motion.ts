import { VideoAnnotationTimelineEasing } from '../types';
import { track } from './timeline';

export function defaultTracks() {
  return [
    track(
      'panel-mask',
      'panel',
      'maskProgress',
      0.18,
      1,
      420,
      VideoAnnotationTimelineEasing.LINEAR
    ),
    track('headline-x', 'headline', 'x', -14, 0, 520, VideoAnnotationTimelineEasing.EASE_OUT),
    track('subline-opacity', 'subline', 'opacity', 0, 1, 680, VideoAnnotationTimelineEasing.LINEAR),
  ];
}
