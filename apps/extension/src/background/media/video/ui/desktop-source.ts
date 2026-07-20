import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  createDesktopMediaSourceChooser as createBackgroundDesktopMediaSourceChooser,
  type DesktopCaptureSourcePickerDeps,
  type DesktopMediaSourceChooserResult,
} from '../../desktop-capture/source-picker';

export type { DesktopMediaSourceChooserResult };

export function createDesktopMediaSourceChooser(deps?: DesktopCaptureSourcePickerDeps) {
  return function chooseDesktopMediaSource(
    _captureMode: CaptureMode
  ): Promise<DesktopMediaSourceChooserResult> {
    return createBackgroundDesktopMediaSourceChooser(deps)(_captureMode);
  };
}
