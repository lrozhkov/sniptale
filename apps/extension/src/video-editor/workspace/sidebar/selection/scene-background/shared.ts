import type { VideoProjectSceneBackground } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';

export type SceneBackground = VideoProjectSceneBackground;
export type GradientSceneBackground = Extract<SceneBackground, { kind: 'gradient' }>;
type PreviewSceneBackground = WorkspaceSidebarSelectionPanelProps['onPreviewSceneBackground'];
type RememberRecentColor = WorkspaceSidebarSelectionPanelProps['onRememberRecentColor'];
type SetSceneBackground = WorkspaceSidebarSelectionPanelProps['onSetSceneBackground'];

export interface SceneBackgroundFieldProps {
  imageAssets: WorkspaceSidebarSelectionPanelProps['project']['assets'];
  onPreviewSceneBackground: PreviewSceneBackground;
  onRememberRecentColor: RememberRecentColor;
  onResetSceneBackgroundPreview: WorkspaceSidebarSelectionPanelProps['onResetSceneBackgroundPreview'];
  onSetSceneBackground: SetSceneBackground;
  recentColors: WorkspaceSidebarSelectionPanelProps['recentColors'];
  sceneBackground: SceneBackground;
}

export const SCENE_BACKGROUND_PALETTE = [
  '#18181b',
  '#27272a',
  '#09090b',
  '#334155',
  '#2563eb',
  '#0f766e',
  '#14b8a6',
  '#f97316',
  '#e11d48',
  '#fafafa',
] as const;
