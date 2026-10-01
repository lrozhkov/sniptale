import React from 'react';
import { useAppLocale } from '../../../../platform/i18n';
import type { ToolbarCaptureActionsProps } from '../types';
import { ToolbarCaptureActionGroup } from './group';
import { useCaptureActionPersistence } from './persistence';
import { useToolbarCaptureMenus } from './use-menus';

export const ToolbarCaptureActions: React.FC<ToolbarCaptureActionsProps> = (props) => {
  useAppLocale();
  const menus = useToolbarCaptureMenus(props.toolbarMenuState);
  const handleSelectCaptureAction = useCaptureActionPersistence(
    props.captureAction,
    props.onCaptureActionChange,
    menus.closeMenus,
    props.onCaptureActionCommitted
  );

  return (
    <ToolbarCaptureActionGroup
      {...props}
      menus={menus}
      onSelectCaptureAction={handleSelectCaptureAction}
    />
  );
};
