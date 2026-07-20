import type { VideoTemplateDirection } from '../types/index';

export interface ResolvedTransitionVisualState {
  blurAmount: number;
  opacityMultiplier: number;
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

export interface ResolvedTransitionOverlay {
  alpha: number;
  color: string;
  direction: VideoTemplateDirection;
  kind: 'fill' | 'sweep';
  progress: number;
  softness: number;
  transitionId: string;
  width: number;
}

export const IDENTITY_TRANSITION_VISUAL_STATE: ResolvedTransitionVisualState = {
  blurAmount: 0,
  opacityMultiplier: 1,
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
};
