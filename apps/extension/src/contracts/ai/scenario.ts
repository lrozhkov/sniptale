import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  ScenarioPoint,
  ScenarioRect,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioStepPatch } from '../../features/scenario/contracts/types/project';
import type { ScenarioAiOperation } from '@sniptale/runtime-contracts/scenario-ai-operations';

export type ScenarioAIAnnotationTool =
  | 'focus-rect'
  | 'click-ring'
  | 'cursor'
  | 'arrow'
  | 'rectangle'
  | 'ellipse'
  | 'text'
  | 'blur-rect';

export type ScenarioAIAnnotationsMode = 'replace' | 'append' | 'clear';

export type ScenarioAIAttachment = {
  dataUrl: string;
  filename: string;
  mimeType: string;
  stepId: string;
  stepNumber: number;
};

export type ScenarioAIOverlaySummary =
  | { kind: 'focus-rect' | 'rectangle' | 'ellipse' | 'blur-rect'; rect: ScenarioRect }
  | { kind: 'click-ring' | 'cursor'; point: ScenarioPoint }
  | { kind: 'arrow'; start: ScenarioPoint; end: ScenarioPoint }
  | { kind: 'text'; point: ScenarioPoint; text: string };

export interface ScenarioEditorStepSnapshot {
  body: string;
  currentOverlaysSummary: ScenarioAIOverlaySummary[];
  currentZoom: number;
  imageFilename?: string;
  interactionPoint: ScenarioPoint | null;
  kind: string;
  page: {
    devicePixelRatio: number;
    scrollX: number;
    scrollY: number;
    title: string | null;
    url: string | null;
    viewport: ScenarioRect;
  } | null;
  stepId: string;
  stepNumber: number;
  target: {
    ariaLabel: string | null;
    rect: ScenarioRect | null;
    role: string | null;
    selector: string | null;
    tagName: string | null;
    text: string | null;
    title: string | null;
  } | null;
  title: string;
}

export interface ScenarioEditorProjectSnapshot {
  steps: ScenarioEditorStepSnapshot[];
}

type ScenarioAIRectAnnotation = {
  rect: ScenarioRect;
  tool: Extract<ScenarioAIAnnotationTool, 'focus-rect' | 'rectangle' | 'ellipse' | 'blur-rect'>;
};

type ScenarioAIPointAnnotation = {
  point: ScenarioPoint;
  tool: Extract<ScenarioAIAnnotationTool, 'click-ring' | 'cursor'>;
};

type ScenarioAIArrowAnnotation = {
  end: ScenarioPoint;
  start: ScenarioPoint;
  tool: 'arrow';
};

type ScenarioAITextAnnotation = {
  point: ScenarioPoint;
  text: string;
  tool: 'text';
};

export type ScenarioAIAnnotation =
  | ScenarioAIArrowAnnotation
  | ScenarioAIPointAnnotation
  | ScenarioAIRectAnnotation
  | ScenarioAITextAnnotation;

export interface ScenarioEditorAIRequestedStepChange {
  annotations?: ScenarioAIAnnotation[] | undefined;
  annotationsMode?: ScenarioAIAnnotationsMode | undefined;
  body?: string | undefined;
  focusPoint?: ScenarioPoint | undefined;
  stepId: string;
  title?: string | undefined;
  zoom?: number | undefined;
}

export interface ProcessScenarioEditorWithLLMMessage {
  attachments: ScenarioAIAttachment[];
  contractVersion: 3;
  instruction: string;
  llmSessionToken: string;
  modelId?: string | null | undefined;
  projectOutlineJson?: string | undefined;
  projectSnapshotJson: string;
  selectedSlideCodeJson?: string | undefined;
  toolManifestJson?: string | undefined;
  type: typeof MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM;
}

export type ScenarioAIParseError = 'invalid-json' | `invalid-schema:${number}`;

export interface ProcessScenarioEditorWithLLMResponse {
  error?: string | undefined;
  operations?: ScenarioAiOperation[] | undefined;
  parseError?: ScenarioAIParseError | undefined;
  steps?: ScenarioEditorAIRequestedStepChange[] | undefined;
  success: boolean;
}

export interface ScenarioEditorAppliedPatch {
  patch: ScenarioStepPatch;
  stepId: string;
}
