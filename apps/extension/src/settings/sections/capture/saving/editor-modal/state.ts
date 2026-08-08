import { useEffect, useState, type FormEvent } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import type { SavePresetEditorModalProps } from './types';

const logger = createLogger({ namespace: 'SettingsSavePresetEditor' });

export function useSavePresetEditorState(props: SavePresetEditorModalProps) {
  const [name, setName] = useState(props.preset?.name ?? '');
  const [path, setPath] = useState(props.preset?.path ?? '');
  const [enabled, setEnabled] = useState(props.preset?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(props.preset?.name ?? '');
    setPath(props.preset?.path ?? '');
    setEnabled(props.preset?.enabled ?? true);
  }, [props.preset]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    setSaving(true);

    try {
      await props.onSave(name.trim(), path, enabled);
      props.onClose();
    } catch (error) {
      logger.error('Save preset failed', error);
    } finally {
      setSaving(false);
    }
  };

  return {
    enabled,
    handleSubmit,
    isSubmitDisabled: saving || !name.trim(),
    name,
    path,
    saving,
    setEnabled,
    setName,
    setPath,
  };
}
