import { translate } from '../../../platform/i18n';
import { ProductField, ProductInput, ProductTextarea } from '@sniptale/ui/product-form-controls';
import type { usePromptTemplateEditorState } from './use-state';

function PromptTemplateNameField(props: {
  isLoading: boolean;
  state: ReturnType<typeof usePromptTemplateEditorState>;
}) {
  return (
    <div className="sniptale-modal-field-surface">
      <ProductField
        label={translate('templates.editor.nameLabel')}
        error={props.state.validation.errors.name}
      >
        <ProductInput
          ref={props.state.fields.nameInputRef}
          id="template-name"
          type="text"
          value={props.state.fields.name}
          onChange={(event) => {
            props.state.fields.setName(event.target.value);
            props.state.validation.setErrors((prev) => {
              const { name: _name, ...rest } = prev;
              return rest;
            });
          }}
          disabled={props.isLoading}
          placeholder={translate('templates.editor.namePlaceholder')}
          autoComplete="off"
          maxLength={50}
          invalid={Boolean(props.state.validation.errors.name)}
        />
      </ProductField>
    </div>
  );
}

function PromptTemplateContentField(props: {
  isLoading: boolean;
  state: ReturnType<typeof usePromptTemplateEditorState>;
}) {
  return (
    <div className="sniptale-modal-field-surface">
      <ProductField
        label={translate('templates.editor.contentLabel')}
        error={props.state.validation.errors.content}
      >
        <ProductTextarea
          id="template-content"
          value={props.state.fields.content}
          onChange={(event) => {
            props.state.fields.setContent(event.target.value);
            props.state.validation.setErrors((prev) => {
              const { content: _content, ...rest } = prev;
              return rest;
            });
          }}
          disabled={props.isLoading}
          placeholder={translate('templates.editor.contentPlaceholder')}
          rows={5}
          invalid={Boolean(props.state.validation.errors.content)}
          style={{ minHeight: 'auto' }}
        />
      </ProductField>
    </div>
  );
}

export function PromptTemplateEditorFields({
  isLoading,
  state,
}: {
  isLoading: boolean;
  state: ReturnType<typeof usePromptTemplateEditorState>;
}) {
  return (
    <>
      <PromptTemplateNameField isLoading={isLoading} state={state} />
      <PromptTemplateContentField isLoading={isLoading} state={state} />
    </>
  );
}
