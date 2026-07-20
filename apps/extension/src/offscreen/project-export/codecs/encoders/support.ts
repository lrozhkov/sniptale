import { translate, type TranslationKey } from '../../../../platform/i18n';

import { buildMissingEncoderMessage, recordEncoderAttemptFailure } from './messages';

export function ensureMp4ExportSupport(needsAudio: boolean): void {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error(translate('offscreenExport.videoEncoderUnavailable'));
  }

  if (needsAudio && typeof AudioEncoder === 'undefined') {
    throw new Error(translate('offscreenExport.audioEncoderUnavailable'));
  }
}

interface EncoderProbeSupportResult<TConfig> {
  supported?: boolean;
  config?: TConfig;
}

interface ProbeSupportedEncoderCandidateArgs<TCandidate, TConfig, TResult> {
  candidates: readonly TCandidate[];
  getCodec: (candidate: TCandidate) => string;
  getLabel: (candidate: TCandidate) => string;
  createConfig: (candidate: TCandidate) => TConfig;
  isConfigSupported: (config: TConfig) => Promise<EncoderProbeSupportResult<TConfig>>;
  onSupported: (candidate: TCandidate, label: string, config: TConfig) => TResult;
  prefixKey: TranslationKey;
  suffixKey: TranslationKey;
}

export async function probeSupportedEncoderCandidate<TCandidate, TConfig, TResult>({
  candidates,
  getCodec,
  getLabel,
  createConfig,
  isConfigSupported,
  onSupported,
  prefixKey,
  suffixKey,
}: ProbeSupportedEncoderCandidateArgs<TCandidate, TConfig, TResult>): Promise<TResult> {
  const attempts: string[] = [];

  for (const candidate of candidates) {
    const codec = getCodec(candidate);
    const label = getLabel(candidate);
    const config = createConfig(candidate);

    try {
      const support = await isConfigSupported(config);
      if (support.supported) {
        return onSupported(candidate, label, support.config ?? config);
      }

      recordEncoderAttemptFailure(attempts, label, codec);
    } catch (error) {
      recordEncoderAttemptFailure(attempts, label, codec, error);
    }
  }

  throw new Error(buildMissingEncoderMessage({ attempts, prefixKey, suffixKey }));
}
