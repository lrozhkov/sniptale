import {
  InspectorBooleanField,
  InspectorColorField,
  InspectorNativeSelect,
  InspectorNumberField,
  InspectorRangeField,
  InspectorSection,
  InspectorTextField,
} from './fields';

export type ScenarioFieldCallbacks = {
  onBooleanChange: (value: boolean) => void;
  onColorCommit: (value: string) => void;
  onNumberCommit: (value: number) => void;
  onRangeCommit: (value: number) => void;
  onSelectChange: (value: 'left' | 'right') => void;
  onTextCommit: (value: string) => void;
  onTitleCommit: (value: string) => void;
};

export function ScenarioFieldWrapperFixture(props: { callbacks: ScenarioFieldCallbacks }) {
  const { callbacks } = props;
  return (
    <InspectorSection title="Element">
      <InspectorTextField label="Title" value="Scene title" onCommit={callbacks.onTitleCommit} />
      <InspectorTextField
        label="Notes"
        multiline
        value="Initial"
        onCommit={callbacks.onTextCommit}
      />
      <InspectorNumberField
        label="Width"
        min={0}
        max={100}
        value={40}
        onCommit={callbacks.onNumberCommit}
      />
      <InspectorRangeField
        displayScale={100}
        label="Opacity"
        min={0}
        max={1}
        step={0.01}
        unit="%"
        value={0.7}
        onCommit={callbacks.onRangeCommit}
      />
      <InspectorBooleanField label="Visible" value={false} onChange={callbacks.onBooleanChange} />
      <InspectorColorField label="Line color" value="#f97316" onCommit={callbacks.onColorCommit} />
      <InspectorNativeSelect
        label="Align"
        value="left"
        options={[
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ]}
        onChange={callbacks.onSelectChange}
      />
    </InspectorSection>
  );
}
