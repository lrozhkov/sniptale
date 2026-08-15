import React from 'react';
import { useEditorController } from '../../application/controller-context';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import { importEditorSessionFromFile } from '../../document/file-actions';
import { openLocalImageAsEditorDraft } from '../../workflows/open-local-image-draft';

interface EditorInspectorSidebarHiddenInputsProps {
  openImageInputRef: React.Ref<HTMLInputElement>;
  importSessionInputRef: React.Ref<HTMLInputElement>;
  backgroundImageInputRef: React.Ref<HTMLInputElement>;
  setImageData: (data: string | null) => void;
  handleBackgroundImageUpload: (file: File | undefined) => Promise<void>;
}

function handleHiddenFileSelection(
  event: React.ChangeEvent<HTMLInputElement>,
  action: string,
  run: (file: File | undefined) => Promise<void>
) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  fireAndReportEditorAction(action, () => run(file));
}

export function EditorInspectorSidebarHiddenInputs({
  openImageInputRef,
  importSessionInputRef,
  backgroundImageInputRef,
  setImageData,
  handleBackgroundImageUpload,
}: EditorInspectorSidebarHiddenInputsProps) {
  const controller = useEditorController();

  return (
    <>
      <input
        ref={openImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) =>
          handleHiddenFileSelection(event, 'sidebar-open-image-upload', (file) =>
            openLocalImageAsEditorDraft(controller, file, setImageData)
          )
        }
      />
      <input
        ref={importSessionInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) =>
          handleHiddenFileSelection(event, 'sidebar-import-session-upload', (file) =>
            importEditorSessionFromFile(controller, file, setImageData)
          )
        }
      />
      <input
        ref={backgroundImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) =>
          handleHiddenFileSelection(
            event,
            'sidebar-background-image-upload',
            handleBackgroundImageUpload
          )
        }
      />
    </>
  );
}
