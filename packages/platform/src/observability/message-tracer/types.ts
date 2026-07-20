/**
 * Trace Types for Runtime Tracing System
 * Логирование всех сообщений и console вызовов в расширении
 */

// ========================================
// Context Identifiers
// ========================================

/**
 * Идентификатор контекста расширения
 */
export type TraceContext = 'bg' | 'cs' | 'popup' | 'off' | 'editor' | 'video-editor';

// ========================================
// Event Types
// ========================================

/**
 * Уровень логирования (для console событий)
 */
export type TraceLogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

/**
 * Направление сообщения (для msg событий)
 */
type TraceMessageDirection = 'send' | 'recv';

// ========================================
// Console Event
// ========================================

/**
 * Событие console.*
 */
interface TraceConsoleEvent {
  kind: 'console';
  ts: string; // ISO timestamp
  ctx: TraceContext; // Контекст
  level: TraceLogLevel; // log/warn/error/info/debug
  msg: string; // Сообщение (stringified)
  data?: unknown; // Дополнительные данные
  err?: string; // Stack trace для ошибок
}

// ========================================
// Message Passing Event
// ========================================

/**
 * Событие message passing
 */
export interface TraceMessageEvent {
  kind: 'msg';
  ts: string; // ISO timestamp
  id: string; // Correlation ID (для связки send/recv)
  dir: TraceMessageDirection; // send/recv
  from: TraceContext; // Отправитель
  to: TraceContext; // Получатель
  type: string; // Тип сообщения (MessageType enum value)
  payload?: unknown; // Sanitized payload
  duration?: number; // Время обработки (только для recv)
  error?: string; // Ошибка обработки (если есть)
}

// ========================================
// Union Type
// ========================================

/**
 * Любое событие трассировки
 */
export type TraceEvent = TraceConsoleEvent | TraceMessageEvent;

// ========================================
// WebSocket Protocol
// ========================================

/**
 * Сообщение от клиента к серверу
 */
export interface TraceClientMessage {
  event?: TraceEvent;
  command?: 'clear' | 'session_start';
}

// ========================================
// Configuration
// ========================================

/**
 * Конфигурация трассировщика
 */
import { SECRET_KEY_FRAGMENTS } from '../../security/secret-key-fragments';

export interface TraceConfig {
  enabled: boolean; // Включена ли трассировка
  wsUrl: string; // WebSocket URL
  wsPort: number; // WebSocket порт
  reconnectInterval: number; // Интервал переподключения (ms)
  maxReconnectAttempts: number; // Макс. попыток переподключения
  sanitizeKeys: string[]; // Ключи для sanitization (apiKey, etc.)
  maxPayloadSize: number; // Макс. размер payload (chars)
  maxBufferSize: number; // Макс. размер очереди до подключения WS
  batchSize: number; // Размер батча для отправки (производительность)
  batchInterval: number; // Интервал отправки батча (ms)
}

declare const __SNIPTALE_TRACE_WS_URL__: unknown;

/**
 * Конфигурация по умолчанию
 */
function getDefaultTraceWsUrl(): string {
  if (typeof __SNIPTALE_TRACE_WS_URL__ === 'string') {
    return __SNIPTALE_TRACE_WS_URL__;
  }

  return 'ws://localhost';
}

export const DEFAULT_TRACE_CONFIG: TraceConfig = {
  enabled: false,
  wsUrl: getDefaultTraceWsUrl(),
  wsPort: 9223,
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
  sanitizeKeys: [...SECRET_KEY_FRAGMENTS],
  maxPayloadSize: 1000,
  maxBufferSize: 500, // Максимум 500 событий в очереди
  batchSize: 50, // Отправлять по 50 событий за раз
  batchInterval: 100, // Каждые 100ms
};

// ========================================
// Sanitization
// ========================================
