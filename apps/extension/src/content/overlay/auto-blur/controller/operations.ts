import type {
  AutoBlurCategory,
  AutoBlurSettings,
} from '../../../../features/highlighter/contracts/auto-blur';
import type { BlurSettings } from '../../../../features/highlighter/contracts';
import {
  DEFAULT_AUTO_BLUR_SETTINGS,
  loadAutoBlurSettings,
  saveAutoBlurSettings,
} from '../persistence';
import { createLogger } from '@sniptale/platform/observability/logger';
import { scanAutoBlurTargets, type AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import type { useContentAppBindings } from '../../app/bindings';

const logger = createLogger({ namespace: 'ContentAutoBlur' });

export type AutoBlurFrameManager = Pick<
  ReturnType<typeof useContentAppBindings>,
  'clearAutoBlurFrames' | 'frames' | 'syncAutoBlurFrames'
>;

export function createTargets(matches: AutoBlurMatch[]) {
  return matches.map((match) => ({
    element: match.element,
    id: match.id,
    rect: match.rect,
  }));
}

function cloneSettings(settings: AutoBlurSettings): AutoBlurSettings {
  return {
    autoApplyEnabled: settings.autoApplyEnabled,
    blurSettings: { ...settings.blurSettings },
    selectedCategories: [...settings.selectedCategories],
  };
}

export async function loadSettingsOrDefault(): Promise<AutoBlurSettings> {
  try {
    return await loadAutoBlurSettings();
  } catch (error) {
    logger.warn('Failed to load auto-blur settings, falling back to defaults', error);
    return cloneSettings(DEFAULT_AUTO_BLUR_SETTINGS);
  }
}

export async function applyAutoBlurWithSettings(args: {
  blurSettings: BlurSettings;
  frameManager: AutoBlurFrameManager;
  frames: AutoBlurFrameManager['frames'];
  selectedCategories: Iterable<AutoBlurCategory>;
  scanMode?: 'current-view' | 'full-page';
}) {
  const selectedCategories = new Set(args.selectedCategories);
  const result = await scanAutoBlurTargets({
    frames: args.frames,
    ...(args.scanMode === undefined ? {} : { mode: args.scanMode }),
  });
  const selectedMatches = result.matches.filter(
    (match) => !match.alreadyBlurred && selectedCategories.has(match.category)
  );

  return args.frameManager.syncAutoBlurFrames({
    ...(args.scanMode === 'full-page' ? { allowDeferredInitialPlacement: true } : {}),
    blurSettings: args.blurSettings,
    targets: createTargets(selectedMatches),
  });
}

export async function persistSettings(args: {
  autoApplyEnabled: boolean;
  blurSettings: BlurSettings;
  selectedCategories: Set<AutoBlurCategory>;
}) {
  await saveAutoBlurSettings({
    autoApplyEnabled: args.autoApplyEnabled,
    selectedCategories: [...args.selectedCategories],
    blurSettings: args.blurSettings,
  });
}
