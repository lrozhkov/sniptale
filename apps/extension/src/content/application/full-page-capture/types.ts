import type {
  FullPageCaptureGeometry,
  FullPageCapturePreferences,
  FullPageCaptureSessionIdentity,
} from '../../../contracts/full-page-capture';
import type { PageScrollRoot } from '../../platform/page-scroll';

export type ScrollCaptureRoot = PageScrollRoot;

export type OwnedStyleMutation = {
  appliedPriority: string;
  appliedValue: string;
  element: HTMLElement;
  priorPriority: string;
  priorValue: string;
  property: string;
};

export type OwnedClassMutation = {
  className: string;
  element: HTMLElement;
  wasPresent: boolean;
};

export type FloatingAnchor = {
  bottom: boolean;
  center: boolean;
  left: boolean;
  right: boolean;
  top: boolean;
};

export type FloatingCandidate = {
  appliedVisibility: string | null;
  anchor: FloatingAnchor;
  element: HTMLElement;
  pendingShown: boolean;
  position: 'fixed' | 'sticky';
  priorVisibility: string;
  priorVisibilityPriority: string;
  shellOnly: boolean;
  shown: boolean;
};

export type VideoSnapshot = {
  currentTime: number;
  video: HTMLVideoElement;
  wasPlaying: boolean;
};

export type FullPageAgentSession = {
  abortController: AbortController;
  classMutations: OwnedClassMutation[];
  floating: FloatingCandidate[];
  frozenExtentWarning: boolean;
  geometry: FullPageCaptureGeometry;
  hadScrollbarClass: boolean;
  identity: FullPageCaptureSessionIdentity;
  layoutGeneration: string;
  mutations: OwnedStyleMutation[];
  originalScroll: { x: number; y: number };
  preferences: FullPageCapturePreferences;
  root: ScrollCaptureRoot;
  restored: boolean;
  styleElement: HTMLStyleElement | null;
  videos: VideoSnapshot[];
  warnings: string[];
  watchdog: ReturnType<typeof setTimeout> | null;
};
