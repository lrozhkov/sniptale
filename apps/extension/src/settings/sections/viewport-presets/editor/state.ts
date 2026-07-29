import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';

import { createLogger } from '@sniptale/platform/observability/logger';
import type { ViewportPreset, ViewportPresetTarget } from '../../../../contracts/settings';
import type { ViewportPresetDraft } from '../helpers';
import { syncViewportPresetForm } from './helpers';
import { isValidViewportPresetName } from '../../../../features/viewport-presets/operations';

const logger = createLogger({ namespace: 'SettingsViewportPresetEditor' });

interface ViewportPresetEditorStateParams {
  isLoading?: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSave: (draft: ViewportPresetDraft) => Promise<void>;
  preset?: ViewportPreset;
}

export function useViewportPresetEditorState(props: ViewportPresetEditorStateParams) {
  const [label, setLabel] = useState('');
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [target, setTarget] = useState<ViewportPresetTarget>('viewport');
  const [isSaving, setIsSaving] = useState(false);
  const [nameEdited, setNameEdited] = useState(false);
  const setEditedLabel: typeof setLabel = (value) => {
    setNameEdited(true);
    setLabel(value);
  };

  useEffect(() => {
    syncViewportPresetForm(props.preset, setLabel, setWidth, setHeight);
    setTarget(props.preset?.target ?? 'viewport');
    setNameEdited(false);
  }, [props.isOpen, props.preset]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!isValidViewportPresetName(label)) {
      return;
    }

    setIsSaving(true);
    try {
      await props.onSave({ height, name: label.trim(), nameEdited, target, width });
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
    form: {
      height,
      label,
      setHeight,
      setLabel: setEditedLabel,
      setTarget,
      setWidth,
      target,
      width,
    },
    handlers: { handleKeyDown, handleSubmit },
    status: {
      isDisabled: props.isLoading || isSaving,
      isSaving,
    },
  };
}
