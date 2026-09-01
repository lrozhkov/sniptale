import { translate } from '../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toast } from '@sniptale/ui/product-feedback/toast-service';

const logger = createLogger({ namespace: 'EditorAsyncAction' });

type EditorAsyncAction = () => Promise<void> | void;

type EditorActionFailureOptions = {
  context?: Record<string, unknown> | undefined;
  fallbackMessage?: string | undefined;
  notify?: boolean | undefined;
};

function resolveEditorActionErrorMessage(
  error: unknown,
  fallbackMessage = translate('common.states.error')
) {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallbackMessage;
}

export function reportEditorActionFailure(
  action: string,
  error: unknown,
  options: EditorActionFailureOptions = {}
): string {
  const message = resolveEditorActionErrorMessage(error, options.fallbackMessage);
  logger.error(`${action} failed`, error, options.context);
  if (options.notify !== false) {
    toast.error(message);
  }
  return message;
}

export function fireAndReportEditorAction(
  action: string,
  run: EditorAsyncAction,
  options: EditorActionFailureOptions = {}
): void {
  void Promise.resolve()
    .then(run)
    .catch((error) => {
      reportEditorActionFailure(action, error, options);
    });
}

export async function runAndReportEditorAction(
  action: string,
  run: EditorAsyncAction,
  options: EditorActionFailureOptions = {}
): Promise<void> {
  try {
    await Promise.resolve(run());
  } catch (error) {
    reportEditorActionFailure(action, error, options);
    throw error;
  }
}
