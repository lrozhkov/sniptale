import { useRef, useState, type ChangeEvent } from 'react';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index.library.ts';
import type { MediaLibraryItem } from '../../../composition/persistence/media-library/contracts';
import { translate } from '../../../platform/i18n';
import type { ScenarioEditorInsertImagePayload } from '../../project/state/types';
import { buildLibraryImagePayload, createFileImagePayload } from './payload';
import { useScenarioImageStepLibrary } from './useScenarioImageStepLibrary';

function useScenarioImageStepDialogActions(args: {
  handleInsert: (payload: ScenarioEditorInsertImagePayload) => Promise<void>;
  setError: (error: string | null) => void;
}) {
  const handleLibrarySelect = async (item: MediaLibraryItem) => {
    const blob = await getMediaAssetBlob(item.id);
    if (!blob) {
      args.setError(translate('shared.runtime.readBlobFailed'));
      return;
    }

    await args.handleInsert(buildLibraryImagePayload(item, blob));
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (file) {
      await args.handleInsert(createFileImagePayload(file));
    }
  };

  const handleFileDrop = async (files: FileList | null) => {
    const file = files?.[0];
    if (file) {
      await args.handleInsert(createFileImagePayload(file));
    }
  };

  return { handleFileChange, handleFileDrop, handleLibrarySelect };
}

export function useScenarioImageStepDialog(
  onInsertImage: (payload: ScenarioEditorInsertImagePayload) => Promise<void>
) {
  const { error, handleInsert, pending, setError } =
    useScenarioImageStepInsertAction(onInsertImage);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { filteredItems, loading, thumbnailUrls } = useScenarioImageStepLibrary(search);
  const { handleFileChange, handleFileDrop, handleLibrarySelect } =
    useScenarioImageStepDialogActions({ handleInsert, setError });

  return {
    error,
    fileInputRef,
    filteredItems,
    handleFileChange,
    handleFileDrop,
    handleLibrarySelect,
    loading,
    openFilePicker: () => fileInputRef.current?.click(),
    pending,
    search,
    setSearch,
    thumbnailUrls,
  };
}

function useScenarioImageStepInsertAction(
  onInsertImage: (payload: ScenarioEditorInsertImagePayload) => Promise<void>
) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleInsert = async (payload: ScenarioEditorInsertImagePayload) => {
    setPending(true);
    setError(null);
    try {
      await onInsertImage(payload);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : translate('shared.runtime.readBlobFailed')
      );
      setPending(false);
    }
  };

  return {
    error,
    handleInsert,
    pending,
    setError,
  };
}
