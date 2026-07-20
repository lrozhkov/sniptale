import React from 'react';
import { useAppLocale } from '../../../../platform/i18n';
import { useContentPortalTheme } from '../layout/portal';
import { InteractiveFrameSizePanelContent } from './view';
import type { SizePanelProps } from './types';

export function InteractiveFrameSizePanel({
  state,
  sizePanelCoords,
  tempFrame,
  setTempFrame,
  maintainAspectRatio,
  setMaintainAspectRatio,
  aspectRatio,
  setAspectRatio,
  effectMode,
  frameId,
  handleSave,
  handleCancel,
}: SizePanelProps): React.ReactElement | null {
  useAppLocale();
  const portalTheme = useContentPortalTheme();

  if (state !== 'editing') {
    return null;
  }

  return (
    <InteractiveFrameSizePanelContent
      portalTheme={portalTheme}
      sizePanelCoords={sizePanelCoords}
      handleSave={handleSave}
      handleCancel={handleCancel}
      panelProps={{
        state,
        sizePanelCoords,
        tempFrame,
        setTempFrame,
        maintainAspectRatio,
        setMaintainAspectRatio,
        aspectRatio,
        setAspectRatio,
        effectMode,
        frameId,
        handleSave,
        handleCancel,
      }}
    />
  );
}
