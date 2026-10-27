import {
  ProductField,
  ProductInput,
  ProductSelect,
  ProductTextarea,
} from '@sniptale/ui/product-form-controls';
import type {
  AIModelAudioParameters,
  AIModelOperation,
  AISpeechModelParameters,
  AITranscriptionModelParameters,
} from '../../../../../contracts/settings/model-operation';
import { translate } from '../../../../../platform/i18n';

type Props = {
  availableOperations?: readonly AIModelOperation[];
  operation: AIModelOperation;
  audio: AIModelAudioParameters | undefined;
  onOperationChange: ((operation: AIModelOperation) => void) | undefined;
  onAudioChange: ((audio: AIModelAudioParameters) => void) | undefined;
  error: string | undefined;
};

function ChatCompatibilityFields({
  parameters,
  change,
}: {
  parameters: AITranscriptionModelParameters;
  change(next: AITranscriptionModelParameters): void;
}) {
  return (
    <>
      <ProductField label={translate('settings.aiProviders.modelAudioChatProtocol')}>
        <ProductSelect
          aria-label={translate('settings.aiProviders.modelAudioChatProtocol')}
          value={parameters.chatProtocol ?? 'openai'}
          options={[
            {
              value: 'openai',
              label: translate('settings.aiProviders.modelAudioProtocolOpenai'),
            },
            {
              value: 'bothub',
              label: translate('settings.aiProviders.modelAudioProtocolBothub'),
            },
          ]}
          onChange={(value) => {
            if (value === 'openai' || value === 'bothub')
              change({ ...parameters, chatProtocol: value });
          }}
        />
      </ProductField>
      <ProductField label={translate('settings.aiProviders.modelAudioStructuredOutput')}>
        <ProductSelect
          aria-label={translate('settings.aiProviders.modelAudioStructuredOutput')}
          value={parameters.structuredOutput ?? 'json_schema'}
          options={[
            {
              value: 'json_schema',
              label: translate('settings.aiProviders.modelAudioJsonSchema'),
            },
            {
              value: 'json_object',
              label: translate('settings.aiProviders.modelAudioJsonObject'),
            },
          ]}
          onChange={(value) => {
            if (value === 'json_schema' || value === 'json_object')
              change({ ...parameters, structuredOutput: value });
          }}
        />
      </ProductField>
    </>
  );
}

function TranscriptionFields(props: Props) {
  const parameters: AITranscriptionModelParameters = props.audio?.transcription ?? {
    responseFormat: 'verbose_json',
    timestampGranularity: 'word',
  };
  const change = (next: AITranscriptionModelParameters) =>
    props.onAudioChange?.({ transcription: next });
  return (
    <>
      <ProductField label={translate('settings.aiProviders.modelAudioTransport')}>
        <ProductSelect
          aria-label={translate('settings.aiProviders.modelAudioTransport')}
          value={parameters.transport ?? 'audio-api'}
          options={[
            { value: 'audio-api', label: translate('settings.aiProviders.modelAudioSpeechApi') },
            { value: 'audio-chat', label: translate('settings.aiProviders.modelAudioMultimodal') },
          ]}
          onChange={(value) => {
            if (value === 'audio-chat')
              change({
                ...parameters,
                transport: value,
                chatProtocol: 'openai',
                structuredOutput: 'json_schema',
                responseFormat: 'json',
                timestampGranularity: 'none',
              });
            if (value === 'audio-api') {
              const { chatProtocol: _protocol, structuredOutput: _output, ...rest } = parameters;
              change({
                ...rest,
                transport: value,
                responseFormat: 'verbose_json',
                timestampGranularity: 'word',
              });
            }
          }}
        />
      </ProductField>
      {parameters.transport === 'audio-chat' && (
        <ChatCompatibilityFields parameters={parameters} change={change} />
      )}
      <ProductField label={translate('settings.aiProviders.modelAudioLanguage')}>
        <ProductInput
          aria-label={translate('settings.aiProviders.modelAudioLanguage')}
          value={parameters.language ?? ''}
          placeholder={translate('settings.aiProviders.modelAudioAuto')}
          onChange={(event) => {
            const { language: _language, ...rest } = parameters;
            change(event.target.value ? { ...rest, language: event.target.value } : rest);
          }}
        />
      </ProductField>
      {parameters.transport !== 'audio-chat' && (
        <>
          <ProductField label={translate('settings.aiProviders.modelAudioFormat')}>
            <ProductSelect
              aria-label={translate('settings.aiProviders.modelAudioFormat')}
              value={parameters.responseFormat}
              options={[
                { value: 'json', label: 'JSON' },
                {
                  value: 'verbose_json',
                  label: translate('settings.aiProviders.modelAudioVerboseJson'),
                },
              ]}
              onChange={(value) => {
                if (value === 'json' || value === 'verbose_json')
                  change({
                    ...parameters,
                    responseFormat: value,
                    timestampGranularity:
                      value === 'json' ? 'none' : parameters.timestampGranularity,
                  });
              }}
            />
          </ProductField>
          <ProductField label={translate('settings.aiProviders.modelAudioTimestamps')}>
            <ProductSelect
              aria-label={translate('settings.aiProviders.modelAudioTimestamps')}
              value={parameters.timestampGranularity}
              options={[
                {
                  value: 'none',
                  label: translate('settings.aiProviders.modelAudioTimestampsNone'),
                },
                ...(parameters.responseFormat === 'verbose_json'
                  ? [
                      {
                        value: 'segment',
                        label: translate('settings.aiProviders.modelAudioTimestampsSegment'),
                      },
                      {
                        value: 'word',
                        label: translate('settings.aiProviders.modelAudioTimestampsWord'),
                      },
                    ]
                  : []),
              ]}
              onChange={(value) => {
                if (value === 'none' || value === 'segment' || value === 'word')
                  change({ ...parameters, timestampGranularity: value });
              }}
            />
          </ProductField>
        </>
      )}
      <ProductField label={translate('settings.aiProviders.modelAudioPrompt')}>
        <ProductTextarea
          aria-label={translate('settings.aiProviders.modelAudioPrompt')}
          rows={2}
          value={parameters.prompt ?? ''}
          onChange={(event) => change({ ...parameters, prompt: event.target.value })}
        />
      </ProductField>
    </>
  );
}

function SpeechFields(props: Props) {
  const parameters: AISpeechModelParameters = props.audio?.speech ?? {
    voiceId: '',
    responseFormat: 'mp3',
  };
  const change = (next: AISpeechModelParameters) => props.onAudioChange?.({ speech: next });
  return (
    <>
      <ProductField label={translate('settings.aiProviders.modelAudioVoice')}>
        <ProductInput
          aria-label={translate('settings.aiProviders.modelAudioVoice')}
          value={parameters.voiceId}
          onChange={(event) => change({ ...parameters, voiceId: event.target.value })}
        />
      </ProductField>
      <ProductField label={translate('settings.aiProviders.modelAudioFormat')}>
        <ProductSelect
          aria-label={translate('settings.aiProviders.modelAudioFormat')}
          value={parameters.responseFormat}
          options={[
            { value: 'mp3', label: 'MP3' },
            { value: 'wav', label: 'WAV' },
            { value: 'pcm', label: translate('settings.aiProviders.modelAudioPcm') },
          ]}
          onChange={(value) => {
            if (value === 'mp3' || value === 'wav' || value === 'pcm')
              change({ ...parameters, responseFormat: value });
          }}
        />
      </ProductField>
      <ProductField label={translate('settings.aiProviders.modelAudioSpeed')}>
        <ProductInput
          aria-label={translate('settings.aiProviders.modelAudioSpeed')}
          type="number"
          min={0.25}
          max={4}
          step={0.05}
          value={parameters.speed ?? ''}
          onChange={(event) => {
            const { speed: _speed, ...rest } = parameters;
            change(
              event.target.value === '' ? rest : { ...rest, speed: event.target.valueAsNumber }
            );
          }}
        />
      </ProductField>
      <ProductField label={translate('settings.aiProviders.modelAudioInstructions')}>
        <ProductTextarea
          aria-label={translate('settings.aiProviders.modelAudioInstructions')}
          rows={2}
          value={parameters.instructions ?? ''}
          onChange={(event) => {
            const { instructions: _instructions, ...rest } = parameters;
            change(event.target.value ? { ...rest, instructions: event.target.value } : rest);
          }}
        />
      </ProductField>
    </>
  );
}

export function ModelAudioFields(props: Props) {
  return (
    <>
      <ProductField
        label={translate('settings.aiProviders.modelOperationLabel')}
        error={props.error}
      >
        <ProductSelect
          aria-label={translate('settings.aiProviders.modelOperationLabel')}
          value={props.operation}
          options={[
            { value: 'text', label: translate('settings.aiProviders.modelOperationText') },
            {
              value: 'transcription',
              label: translate('settings.aiProviders.modelOperationTranscription'),
            },
            { value: 'speech', label: translate('settings.aiProviders.modelOperationSpeech') },
          ].filter(
            (option) =>
              props.availableOperations === undefined ||
              props.availableOperations.some((operation) => operation === option.value)
          )}
          onChange={(value) => {
            if (value === 'text' || value === 'transcription' || value === 'speech')
              props.onOperationChange?.(value);
          }}
        />
      </ProductField>
      {props.operation === 'transcription' ? <TranscriptionFields {...props} /> : null}
      {props.operation === 'speech' ? <SpeechFields {...props} /> : null}
    </>
  );
}
