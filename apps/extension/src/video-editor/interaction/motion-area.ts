import { VideoMotionFocusMode } from '../../features/video/project/types/index';
import type {
  VideoProjectMotionArea,
  VideoProjectMotionRegion,
} from '../../features/video/project/types/index';

type MotionAreaPatch = Pick<VideoProjectMotionRegion, 'focusArea' | 'focusMode'>;

type UpdateMotionRegion = (motionRegionId: string, patch: MotionAreaPatch) => void;

export function updateMotionArea(
  motionRegionId: string,
  area: VideoProjectMotionArea,
  onUpdateMotionRegion: UpdateMotionRegion
): void {
  onUpdateMotionRegion(motionRegionId, {
    focusArea: area,
    focusMode: VideoMotionFocusMode.MANUAL_AREA,
  });
}
