import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import { insertEditorImageFromFile } from '../../document/file-actions';
import { EditorIconButton } from '../../chrome/ui';

export function LayerInsertImageControl() {
  const controller = useEditorController();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          fireAndReportEditorAction('layers-insert-image-upload', () =>
            insertEditorImageFromFile(controller, file)
          );
        }}
      />
      <EditorIconButton
        title={translate('editor.toolbar.insertImage')}
        className="h-8 w-8 shrink-0"
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus size={15} strokeWidth={2} />
      </EditorIconButton>
    </>
  );
}
