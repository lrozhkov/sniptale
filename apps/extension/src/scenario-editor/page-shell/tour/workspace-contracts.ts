import type { ReactNode } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type {
  importScenarioImages,
  importScenarioNarration,
} from '../../../composition/persistence/scenario/store/public';
import type { useGuidePanels } from '../panel-layout';
import type { useTourSelection } from './selection';
import type { Translate } from '../../../platform/i18n';

export type TourWorkspaceProps = {
  onImportNarration?: (
    input: Omit<Parameters<typeof importScenarioNarration>[0], 'project' | 'baseUpdatedAt'>
  ) => Promise<boolean>;
  initialSlideId?: string | null;
  onEditImage?: (slideId: string) => void;
  project: GuideProject;
  images: Record<string, string | null>;
  panels: ReturnType<typeof useGuidePanels>;
  header: (contextControls: ReactNode) => ReactNode;
  disabled: boolean;
  importDisabled?: boolean;
  t: Translate;
  onChange: (project: GuideProject, group?: string | null) => void;
  onImport: (
    input: Omit<Parameters<typeof importScenarioImages>[0], 'project' | 'baseUpdatedAt'>
  ) => Promise<boolean>;
};

export type SelectedTourProps = TourWorkspaceProps & {
  state: ReturnType<typeof useTourSelection>;
  onSelectObject: (id: string | null) => void;
};
