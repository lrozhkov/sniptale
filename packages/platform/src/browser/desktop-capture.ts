import { runtimeInfo } from './runtime';

export type BrowserDesktopCaptureSource = 'audio' | 'screen' | 'tab' | 'window';

type BrowserDesktopCaptureSelection = {
  label: string;
  streamId: string;
};

export type BrowserDesktopCaptureResult =
  | { status: 'selected'; selection: BrowserDesktopCaptureSelection }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

type BrowserDesktopCaptureOptions = {
  sources: readonly BrowserDesktopCaptureSource[];
  targetTab?: chrome.tabs.Tab;
};

export type BrowserDesktopCaptureAdapter = {
  chooseDesktopMedia(options: BrowserDesktopCaptureOptions): Promise<BrowserDesktopCaptureResult>;
  isAvailable(): boolean;
};

const UNAVAILABLE_ERROR = 'chrome.desktopCapture.chooseDesktopMedia is unavailable';
const PICKER_FAILED_ERROR = 'Desktop media picker failed';

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : String(error || fallback);
}

function readSelectionLabel(options: unknown): string {
  return (options as { name?: string } | undefined)?.name ?? '';
}

function isDesktopCaptureAvailable(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.desktopCapture !== 'undefined' &&
    typeof chrome.desktopCapture.chooseDesktopMedia === 'function'
  );
}

function chooseDesktopMedia(
  options: BrowserDesktopCaptureOptions
): Promise<BrowserDesktopCaptureResult> {
  return new Promise((resolve) => {
    if (!isDesktopCaptureAvailable()) {
      resolve({ status: 'failed', error: UNAVAILABLE_ERROR });
      return;
    }

    const handleSelection = (streamId: string, selectionOptions?: unknown) => {
      const lastError = runtimeInfo.getLastError();
      if (lastError) {
        resolve({ status: 'failed', error: lastError.message ?? PICKER_FAILED_ERROR });
        return;
      }

      if (!streamId) {
        resolve({ status: 'cancelled' });
        return;
      }

      resolve({
        status: 'selected',
        selection: {
          label: readSelectionLabel(selectionOptions),
          streamId,
        },
      });
    };

    try {
      const sources = [...options.sources] as chrome.desktopCapture.DesktopCaptureSourceType[];
      if (options.targetTab) {
        chrome.desktopCapture.chooseDesktopMedia(sources, options.targetTab, handleSelection);
        return;
      }

      chrome.desktopCapture.chooseDesktopMedia(sources, handleSelection);
    } catch (error) {
      resolve({ status: 'failed', error: getErrorMessage(error, PICKER_FAILED_ERROR) });
    }
  });
}

export const browserDesktopCapture: BrowserDesktopCaptureAdapter = {
  chooseDesktopMedia,
  isAvailable: isDesktopCaptureAvailable,
};
