import React from 'react';
import { useEditorController } from '../../application/controller-context';
import { EditorTechnicalDataPicker } from '../technical-data-picker';

export const EditorInspectorMetaPanelContent: React.FC = () => {
  return (
    <div className="space-y-3">
      <MetaStampSection />
    </div>
  );
};

function MetaStampSection() {
  const controller = useEditorController();

  return (
    <EditorTechnicalDataPicker
      onInsert={(kinds, layout) => controller.insertTechnicalData(kinds, layout)}
    />
  );
}
