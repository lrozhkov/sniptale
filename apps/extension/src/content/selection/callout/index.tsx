import React from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { useResolvedPortalTheme } from '@sniptale/ui/theme/safe-portal';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { CalloutBody } from './body';
import { resolveCalloutThemeOwner } from './dom';
import { useCalloutEditing } from './editing';
import { createCalloutSettingsKey } from './settings-key';
import { getCalloutLayoutState } from './layout';

interface CalloutProps {
  frameId: string;
  settings: CalloutSettings;
  frameRect: { x: number; y: number; width: number; height: number };
  zIndex: number;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onContentChange: (htmlContent: string) => void;
  onDelete: () => void;
}

/**
 * Компонент Callout - облачко с текстом рядом с рамкой
 * Поддерживает inline-редактирование и Rich Text (bold, italic, underline)
 */
export const Callout: React.FC<CalloutProps> = ({
  frameId,
  settings,
  frameRect,
  zIndex,
  isEditing,
  onStartEditing,
  onStopEditing,
  onContentChange,
  onDelete,
}) => {
  useAppLocale();
  const portalTheme = useResolvedPortalTheme(resolveCalloutThemeOwner());
  const editing = useCalloutEditing({
    frameId,
    htmlContent: settings.htmlContent,
    isEditing,
    onContentChange,
    onDelete,
    onStartEditing,
    onStopEditing,
    settingsKey: createCalloutSettingsKey(settings),
  });
  const layout = getCalloutLayoutState({
    dimensions: editing.dimensions,
    frameRect,
    isEditing,
    settings,
    zIndex,
  });

  return (
    <CalloutBody {...createCalloutBodyProps(editing, isEditing, layout, portalTheme, settings)} />
  );
};

function createCalloutBodyProps(
  editing: ReturnType<typeof useCalloutEditing>,
  isEditing: boolean,
  layout: ReturnType<typeof getCalloutLayoutState>,
  portalTheme: ReturnType<typeof useResolvedPortalTheme>,
  settings: CalloutSettings
) {
  return {
    applyFormatting: editing.applyFormatting,
    cloudStyle: layout.cloudStyle,
    containerRef: editing.containerRef,
    contentEditableRef: editing.contentEditableRef,
    editableStyle: layout.editableStyle,
    effectiveZIndex: layout.effectiveZIndex,
    floatingToolbarRect: editing.floatingToolbarRect,
    handleBlur: editing.handleBlur,
    handleClick: editing.handleClick,
    handleInput: editing.handleInput,
    handleKeyDown: editing.handleKeyDown,
    handlePaste: editing.handlePaste,
    isEditing,
    portalTheme,
    resolvedSide: layout.resolvedSide,
    settings,
    tailOffset: layout.tailOffset,
    wrapperStyle: layout.wrapperStyle,
  };
}
