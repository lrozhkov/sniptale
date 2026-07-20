export const SCENARIO_PRESENTATION_SESSION_STATUS = {
  active: 'active',
  ended: 'ended',
} as const;

export type ScenarioPresentationSessionStatus =
  (typeof SCENARIO_PRESENTATION_SESSION_STATUS)[keyof typeof SCENARIO_PRESENTATION_SESSION_STATUS];

export interface ScenarioPresentationSessionPosition {
  clickIndex: number;
  slideId: string;
}

export interface ScenarioPresentationSessionState extends ScenarioPresentationSessionPosition {
  projectId: string;
  projectUpdatedAt: number;
  revision: number;
  sessionId: string;
  status: ScenarioPresentationSessionStatus;
}
