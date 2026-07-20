import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import type { ViewportPreset } from '../../../../contracts/settings';
import { syncViewportPresetForm } from './helpers';

const logger = createLogger({ namespace: 'SettingsViewportPresetEditor' });

interface ViewportPresetEditorStateParams {
  isLoading?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSave: (label: string, width: number, height: number) => Promise<void>;
  preset?: ViewportPreset;
}

export function useViewportPresetEditorState(props: ViewportPresetEditorStateParams) {
  const [label, setLabel] = useState('');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    syncViewportPresetForm(props.preset, setLabel, setWidth, setHeight);
  }, [props.isOpen, props.preset]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!label.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      await props.onSave(label.trim(), width, height);
      props.onClose();
    } catch (error) {
      logger.error('Failed to save viewport preset', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      props.onClose();
    }
  };

  return {
    handleKeyDown,
    handleSubmit,
    height,
    isDisabled: props.isLoading || isSaving,
    isSaving,
    label,
    setHeight,
    setLabel,
    setWidth,
    width,
  };
}
