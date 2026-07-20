import type { useAiPickController } from '../../ai/pick/controller';
import type { useAutoBlurController } from '../../auto-blur/controller';
import type { useContentAppBindings } from '../bindings';
import type { ContentAppModeState } from '../mode';
import type { useScenarioController } from '../../scenario/controller';
import type { useScreenshotController } from '../../screenshot/controller';
import type { useToolbarModeController } from '../../toolbar/mode-controller';

export interface ContentCoreControllers {
  aiController: ReturnType<typeof useAiPickController>;
  modeController: ReturnType<typeof useToolbarModeController>;
  scenarioController: ReturnType<typeof useScenarioController>;
  screenshotController: ReturnType<typeof useScreenshotController>;
}

export interface ContentAppControllers extends ContentCoreControllers {
  autoBlurController: ReturnType<typeof useAutoBlurController>;
}

interface ContentAppViewState {
  frameManager: ReturnType<typeof useContentAppBindings>;
  modeState: ContentAppModeState;
}

export interface ContentAppViewModel extends ContentAppControllers, ContentAppViewState {}
