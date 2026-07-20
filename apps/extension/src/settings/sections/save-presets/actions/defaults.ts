import { translate } from '../../../../platform/i18n';
import type { TranslationKey } from '../../../../platform/i18n/types';
import type { Settings } from '../../../../contracts/settings';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { CaptureActionType } from '../../../../contracts/settings';
import type { SavePresetsSyncState } from '../state/types';

export function createCaptureActionChangeAction(
  sync: SavePresetsSyncState,
  persistSettings: (partialSettings: Partial<Settings>) => Promise<void>
) {
  return async (value: CaptureActionType) => {
    const previousValue = sync.captureAction;
    sync.setCaptureAction(value);
    try {
      await persistSettings({ captureAction: value });
      toast.success(translate('savePresets.messages.captureActionUpdated'));
    } catch (error) {
      sync.setCaptureAction(previousValue);
      throw error;
    }
  };
}

function restoreDefaultPresetSelection(
  onChange: (id: string | null) => void,
  previousValue: string | null
) {
  onChange(previousValue);
}

export function createDefaultPresetChangeAction(
  persistSettings: (partialSettings: Partial<Settings>) => Promise<void>
) {
  return async (
    field: 'defaultImagePresetId' | 'defaultVideoPresetId' | 'defaultExportPresetId',
    value: string,
    onChange: (id: string | null) => void,
    previousValue: string | null,
    successKey: TranslationKey
  ) => {
    const id = value || null;
    onChange(id);

    try {
      await persistSettings({ [field]: id });
      toast.success(translate(successKey));
    } catch (error) {
      restoreDefaultPresetSelection(onChange, previousValue);
      throw error;
    }
  };
}

export function createToggleSaveToGalleryAction(
  sync: SavePresetsSyncState,
  persistSettings: (partialSettings: Partial<Settings>) => Promise<void>
) {
  return async () => {
    const previousValue = sync.saveCapturesToGallery;
    const nextValue = !sync.saveCapturesToGallery;
    sync.setSaveCapturesToGallery(nextValue);
    try {
      await persistSettings({ saveCapturesToGallery: nextValue });
      toast.success(
        nextValue
          ? translate('savePresets.messages.saveToGalleryEnabled')
          : translate('savePresets.messages.saveToGalleryDisabled')
      );
    } catch (error) {
      sync.setSaveCapturesToGallery(previousValue);
      throw error;
    }
  };
}
