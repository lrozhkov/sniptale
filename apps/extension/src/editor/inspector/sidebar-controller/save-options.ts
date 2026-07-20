import { useEffect, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { loadEditorSaveOptions } from '../../document/file-actions';

export function useInspectorSidebarSaveOptionsState() {
  const [savePresets, setSavePresets] = useState<
    Awaited<ReturnType<typeof loadEditorSaveOptions>>['presets']
  >([]);
  const [defaultImagePresetId, setDefaultImagePresetId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void loadEditorSaveOptions()
      .then((options) => {
        if (cancelled) {
          return;
        }

        setSavePresets(options.presets);
        setDefaultImagePresetId(options.defaultImagePresetId);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setSavePresets([]);
        setDefaultImagePresetId(null);
        toast.error(translate('common.states.error'));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { defaultImagePresetId, savePresets };
}
