import { translate } from '../../../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { SavePreset } from '../../../../../contracts/settings';
import { isPresetUsed } from '../../state/helpers';
import type { SavePresetsSyncState } from '../../state/types';

export function createDeletePresetGuard(sync: SavePresetsSyncState) {
  return (preset: SavePreset) => {
    if (
      isPresetUsed(
        preset.id,
        sync.defaultImagePresetId,
        sync.defaultVideoPresetId,
        sync.defaultExportPresetId
      )
    ) {
      toast.error(translate('savePresets.messages.presetInUseError'));
    }
  };
}
