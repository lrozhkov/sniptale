import { ImageEditorIcon } from '@sniptale/ui/editor-chrome';
import { useEffect, useRef, useState } from 'react';
import {
  getMediaAssetBlob,
  getMediaLibraryEntry,
} from '../../../composition/persistence/media-library';
import { translate } from '../../../platform/i18n';
import { subscribeToMediaHubEvents } from '../../../features/media-hub/events';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import {
  EditorStart,
  getEditorStartCommonLabels,
  useEditorStartItems,
} from '../../../ui/editor-start';
import { openLocalImageAsEditorDraft } from '../../workflows/open-local-image-draft';
import { listRecentEditorImages, readRecentEditorThumbnail } from '../../workflows/recent-images';
import { useEditorStore } from '../../state/useEditorStore';
import type { EditorPageServices } from './runtime';

async function createBlankImage(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 1280, 720);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('Image encoding failed'))),
      'image/png'
    )
  );
  return new File([blob], 'Untitled.png', { type: 'image/png' });
}

export function ImageEditorStart(props: {
  services: EditorPageServices;
  runOpen: (action: () => Promise<void>) => Promise<void>;
}) {
  const { items, status, refresh } = useEditorStartItems(
    listRecentEditorImages,
    readRecentEditorThumbnail
  );
  useEffect(
    () =>
      subscribeToMediaHubEvents((event) => {
        if (event.type === 'library-changed') void refresh();
      }),
    [refresh]
  );
  const input = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>, message: string) => {
    if (pendingRef.current || pending) return;
    pendingRef.current = true;
    setPending(true);
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError(message);
      void refresh();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };
  const openFile = (file: File) =>
    props.runOpen(() =>
      openLocalImageAsEditorDraft(
        props.services.controller,
        file,
        useEditorStore.getState().setImageData
      )
    );
  return (
    <>
      <input
        ref={input}
        className="hidden"
        type="file"
        accept="image/*"
        aria-label={translate('editor.canvas.openImage')}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void run(() => openFile(file), translate('shared.editorStart.openFailed'));
        }}
      />
      <EditorStart
        title={translate('editor.page.documentTitle')}
        description={translate('editor.canvas.emptyDescription')}
        createLabel={translate('editor.page.startCreate')}
        openLabel={translate('editor.canvas.openImage')}
        recentLabel={translate('editor.page.startRecent')}
        {...getEditorStartCommonLabels(translate)}
        items={items}
        status={status}
        actionError={actionError}
        pending={pending}
        icon={<ImageEditorIcon className="size-6" />}
        onCreate={() =>
          void run(
            async () => openFile(await createBlankImage()),
            translate('shared.editorStart.createFailed')
          )
        }
        onOpen={() => input.current?.click()}
        onSelect={(id) =>
          void run(async () => {
            const [entry, blob] = await Promise.all([
              getMediaLibraryEntry(id),
              getMediaAssetBlob(id),
            ]);
            if (!entry || !blob || entry.lifecycle?.trashedAt !== undefined)
              throw new Error('Image unavailable');
            window.location.assign(buildEditorUrl({ assetId: id }));
          }, translate('shared.editorStart.openFailed'))
        }
        onRetry={() => void refresh()}
        onDropFile={(file) =>
          void run(() => openFile(file), translate('shared.editorStart.openFailed'))
        }
      />
    </>
  );
}
