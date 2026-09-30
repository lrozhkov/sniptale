import { useEffect, useRef, useState, type FormEvent } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import type { SavePresetEditorModalProps } from './types';

const logger = createLogger({ namespace: 'SettingsSavePresetEditor' });

export function useSavePresetEditorState(props: SavePresetEditorModalProps) {
  const [name, setName] = useState(props.preset?.name ?? '');
  const [path, setPath] = useState(props.preset?.path ?? '');
  const [enabled, setEnabled] = useState(props.preset?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    setName(props.preset?.name ?? '');
    setPath(props.preset?.path ?? '');
    setEnabled(props.preset?.enabled ?? true);
    setSaveFailed(false);
  }, [props.preset]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!name.trim() || submitting.current) {
      return;
    }

    submitting.current = true;
    setSaveFailed(false);
    setSaving(true);

    try {
      await props.onSave(name.trim(), path, enabled);
    } catch (error) {
      logger.error('Save preset failed', error);
      setSaveFailed(true);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return {
    enabled,
    handleSubmit,
    isSubmitDisabled: saving || !name.trim(),
    name,
    path,
    saveFailed,
    saving,
    setEnabled,
    setName,
    setPath,
  };
}
