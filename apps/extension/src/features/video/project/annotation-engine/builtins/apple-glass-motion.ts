import { VideoAnnotationTimelineEasing } from '../types';
import { track } from './timeline';

export function defaultTracks() {
  return [
    track('panel-scale', 'panel', 'scale', 0.96, 1, 520),
    track('headline-y', 'headline', 'y', 22, 0, 620),
    track('subline-opacity', 'subline', 'opacity', 0, 1, 740),
  ];
}

export function arrowTracks() {
  return [
    track('dot-opacity', 'dot', 'opacity', 0.36, 1, 220),
    track(
      'leader-draw',
      'leader',
      'drawProgress',
      0,
      1,
      980,
      VideoAnnotationTimelineEasing.LINEAR,
      220
    ),
    track(
      'card-mask',
      'panel',
      'maskProgress',
      0.18,
      1,
      1380,
      VideoAnnotationTimelineEasing.EASE_OUT,
      980
    ),
    track(
      'card-scale',
      'panel',
      'scale',
      0.96,
      1,
      1380,
      VideoAnnotationTimelineEasing.EASE_OUT,
      980
    ),
  ];
}
