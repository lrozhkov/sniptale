export function canSubmitAiPickPrompt(args: {
  isLoading?: boolean;
  prompt: string;
  selectedModelId: string | null | undefined;
}) {
  return args.prompt.trim().length > 0 && Boolean(args.selectedModelId) && !args.isLoading;
}
