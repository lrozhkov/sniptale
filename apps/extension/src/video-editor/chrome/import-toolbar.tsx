import type React from 'react';
import { FileAudio2, FilePlus2, Film, ImagePlus, Mic } from 'lucide-react';

import { translate } from '../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

interface VideoEditorImportToolbarProps {
  onCreateProject: () => void | Promise<void>;
  onImportAudio: () => void;
  onImportImage: () => void;
  onImportVideo: () => void;
  onRecordAudio?: () => void;
  presentation?: 'panel' | 'sidebar';
}

function getActionButtonClassName(fullWidth: boolean): string {
  return ['gap-2 text-[12px]', fullWidth ? 'w-full justify-start' : 'justify-center'].join(' ');
}

function ImportActionButton({
  accent = false,
  fullWidth = false,
  icon,
  onClick,
  title,
}: {
  accent?: boolean;
  fullWidth?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <ProductActionButton
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      tone={accent ? 'primary' : 'secondary'}
      data-ui="video-editor.sidebar.library-action"
      className={getActionButtonClassName(fullWidth)}
    >
      {icon}
      <span>{title}</span>
    </ProductActionButton>
  );
}

export function VideoEditorImportToolbar(props: VideoEditorImportToolbarProps) {
  return (
    <div
      className={[
        'grid gap-2',
        props.presentation === 'panel'
          ? ''
          : 'border-b border-[color:var(--sniptale-color-border-subtle)] p-3',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <ImportActionButton
        title={translate('videoEditor.sidebar.toolbarNew')}
        icon={<FilePlus2 size={15} strokeWidth={2} />}
        onClick={() => void props.onCreateProject()}
        accent
        fullWidth
      />
      <ImportActionButton
        title={translate('videoEditor.sidebar.toolbarImage')}
        icon={<ImagePlus size={15} strokeWidth={2} />}
        onClick={props.onImportImage}
        fullWidth
      />
      <ImportActionButton
        title={translate('videoEditor.sidebar.toolbarVideo')}
        icon={<Film size={15} strokeWidth={2} />}
        onClick={props.onImportVideo}
        fullWidth
      />
      <ImportActionButton
        title={translate('videoEditor.sidebar.toolbarAudio')}
        icon={<FileAudio2 size={15} strokeWidth={2} />}
        onClick={props.onImportAudio}
        fullWidth
      />
      {props.onRecordAudio ? (
        <ImportActionButton
          title={translate('videoEditor.sidebar.toolbarRecord')}
          icon={<Mic size={15} strokeWidth={2} />}
          onClick={props.onRecordAudio}
          fullWidth
        />
      ) : null}
    </div>
  );
}
