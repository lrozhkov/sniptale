import type { Settings, ScreenshotCapturePreferences } from '../../contracts/settings';
import {
  DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  type FullPageCapturePreferences,
} from '../../contracts/full-page-capture';
import { createDefaultSettings, loadSettings } from '../../composition/persistence/settings';

type Workflow = 'visible' | 'full' | 'selection';
type CaptureSessionPatch = Partial<Omit<ScreenshotCapturePreferences, 'fullPageCapture'>> & {
  fullPageCapture?: Partial<FullPageCapturePreferences>;
};
const WORKFLOWS: readonly Workflow[] = ['visible', 'full', 'selection'];
const validQuality = (value: number) =>
  Number.isFinite(value) && value >= 1 && value <= 100 ? value : 100;

/** Owns capture overrides for this document lifetime. It never writes Settings. */
export function createCaptureSessionPreferences(dependencies: {
  loadSettings: () => Promise<Settings>;
}) {
  const listeners = new Set<() => void>();
  const overrides: Partial<Record<Workflow, CaptureSessionPatch>> = {};
  const defaults = createDefaultSettings();
  const values: Record<Workflow, ScreenshotCapturePreferences> = {
    visible: { imageFormat: defaults.imageFormat, imageQuality: defaults.imageQuality },
    selection: { imageFormat: defaults.imageFormat, imageQuality: defaults.imageQuality },
    full: {
      imageFormat: defaults.imageFormat,
      imageQuality: defaults.imageQuality,
      fullPageCapture: { ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES },
    },
  };
  let initialization: Promise<void> | null = null;
  const notify = () => listeners.forEach((listener) => listener());
  return {
    read: (workflow: Workflow) => values[workflow],
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async load(): Promise<void> {
      if (!initialization) {
        initialization = dependencies
          .loadSettings()
          .then((settings) => {
            for (const workflow of WORKFLOWS) {
              const image = workflow === 'full' ? (settings.fullPageImage ?? settings) : settings;
              const local = overrides[workflow];
              values[workflow] = {
                imageFormat: local?.imageFormat ?? image.imageFormat,
                imageQuality: validQuality(local?.imageQuality ?? image.imageQuality),
                ...(workflow === 'full' || local?.fullPageCapture
                  ? {
                      fullPageCapture: {
                        ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
                        ...settings.fullPageCapture,
                        ...local?.fullPageCapture,
                      },
                    }
                  : {}),
              };
            }
            notify();
          })
          .catch((error: unknown) => {
            initialization = null;
            throw error;
          });
      }
      return initialization;
    },
    update(workflow: Workflow, patch: CaptureSessionPatch) {
      overrides[workflow] = {
        ...overrides[workflow],
        ...patch,
        ...(patch.fullPageCapture
          ? {
              fullPageCapture: {
                ...overrides[workflow]?.fullPageCapture,
                ...patch.fullPageCapture,
              },
            }
          : {}),
      };
      const current = values[workflow];
      values[workflow] = {
        imageFormat: patch.imageFormat ?? current.imageFormat,
        imageQuality: validQuality(patch.imageQuality ?? current.imageQuality),
        ...(current.fullPageCapture || patch.fullPageCapture
          ? {
              fullPageCapture: {
                ...DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
                ...current.fullPageCapture,
                ...patch.fullPageCapture,
              },
            }
          : {}),
      };
      notify();
    },
  };
}

// Construction has no I/O. The first capture or menu reads defaults once per document.
export const pageCapturePreferences = createCaptureSessionPreferences({ loadSettings });
