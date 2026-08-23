export const SCENARIO_TRANSITION_STYLES = `
  @keyframes sniptaleScenarioFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sniptaleScenarioFadeOut { from { opacity: 1; } to { opacity: 0; } }
  @keyframes sniptaleScenarioSlideIn {
    from { opacity: .2; transform: translateX(18px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes sniptaleScenarioSlideOut {
    from { opacity: 1; transform: translateX(0); }
    to { opacity: 0; transform: translateX(-14px); }
  }
  @keyframes sniptaleScenarioZoomIn {
    from { opacity: .2; transform: scale(.985); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes sniptaleScenarioZoomOut {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0; transform: scale(1.012); }
  }
  @keyframes sniptaleScenarioConvexIn {
    from { opacity: .2; transform: perspective(900px) rotateY(5deg); }
    to { opacity: 1; transform: perspective(900px) rotateY(0); }
  }
  @keyframes sniptaleScenarioConvexOut {
    from { opacity: 1; transform: perspective(900px) rotateY(0); }
    to { opacity: 0; transform: perspective(900px) rotateY(-4deg); }
  }
`;
