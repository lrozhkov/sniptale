import React from 'react';
import { useAppLocale } from '../../../platform/i18n';
import { EditorToolbarContent } from './content';
import { EditorToolbarEmptyState } from './empty-state';
import { EditorToolbarShell } from './shared';
import { useEditorToolbarController } from './use-controller';

interface EditorToolbarProps {
  hasImage: boolean;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ hasImage }) => {
  useAppLocale();
  const toolbarProps = useEditorToolbarController(hasImage);

  if (!hasImage) {
    return (
      <EditorToolbarShell>
        <EditorToolbarEmptyState />
      </EditorToolbarShell>
    );
  }

  return <EditorToolbarContent {...toolbarProps} />;
};
