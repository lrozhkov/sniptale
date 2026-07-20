import { isObjectRecord, isOptionalStringRecord } from '../cdp-record-guards';

export type RequestWillBeSentEvent = {
  requestId: string;
  type?: string;
  request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
  };
};

type ResponseReceivedEvent = {
  requestId: string;
  response: {
    status: number;
    statusText: string;
    mimeType?: string;
    headers?: Record<string, string>;
    protocol?: string;
  };
};

type LoadingFinishedEvent = {
  requestId: string;
  encodedDataLength?: number;
};

type LoadingFailedEvent = {
  requestId: string;
  errorText?: string;
};

export function isRequestWillBeSentEvent(params: unknown): params is RequestWillBeSentEvent {
  if (!isObjectRecord(params) || !isObjectRecord(params['request'])) {
    return false;
  }

  return (
    typeof params['requestId'] === 'string' &&
    typeof params['request']['method'] === 'string' &&
    typeof params['request']['url'] === 'string' &&
    isOptionalStringRecord(params['request']['headers']) &&
    (params['type'] === undefined || typeof params['type'] === 'string')
  );
}

export function isResponseReceivedEvent(params: unknown): params is ResponseReceivedEvent {
  if (!isObjectRecord(params) || !isObjectRecord(params['response'])) {
    return false;
  }

  return (
    typeof params['requestId'] === 'string' &&
    typeof params['response']['status'] === 'number' &&
    typeof params['response']['statusText'] === 'string' &&
    isOptionalStringRecord(params['response']['headers']) &&
    (params['response']['mimeType'] === undefined ||
      typeof params['response']['mimeType'] === 'string') &&
    (params['response']['protocol'] === undefined ||
      typeof params['response']['protocol'] === 'string')
  );
}

export function isLoadingFinishedEvent(params: unknown): params is LoadingFinishedEvent {
  if (!isObjectRecord(params)) {
    return false;
  }

  return (
    typeof params['requestId'] === 'string' &&
    (params['encodedDataLength'] === undefined || typeof params['encodedDataLength'] === 'number')
  );
}

export function isLoadingFailedEvent(params: unknown): params is LoadingFailedEvent {
  if (!isObjectRecord(params)) {
    return false;
  }

  return (
    typeof params['requestId'] === 'string' &&
    (params['errorText'] === undefined || typeof params['errorText'] === 'string')
  );
}
