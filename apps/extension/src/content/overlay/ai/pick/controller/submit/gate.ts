export interface AiSubmitRequestGate {
  begin(): number;
  cancel(): void;
  finish(requestId: number): boolean;
  isCurrent(requestId: number): boolean;
}

export function createAiSubmitRequestGate(): AiSubmitRequestGate {
  let activeRequestId: number | null = null;
  let nextRequestId = 0;

  return {
    begin() {
      nextRequestId += 1;
      activeRequestId = nextRequestId;
      return activeRequestId;
    },
    cancel() {
      activeRequestId = null;
    },
    finish(requestId: number) {
      if (activeRequestId !== requestId) {
        return false;
      }

      activeRequestId = null;
      return true;
    },
    isCurrent(requestId: number) {
      return activeRequestId === requestId;
    },
  };
}
