// Manus presentation contracts only. Domain/API contracts remain in lib/types.ts.
export type RoutePath = "/" | "/campaigns" | "/recommendations" | "/learning";
export type AccentTone = "copper" | "glacier" | "profit" | "neutral" | "caution" | "critical";
export type SignalKind = "risk" | "opportunity";
export type DecisionState = "review" | "approved" | "rejected" | "simulated";

export interface MetricViewModel {
  id: string;
  label: string;
  displayValue: string;
  context?: string;
  tone: AccentTone;
  icon?: string;
}

export interface AxisTick {
  value: number;
  label: string;
}

export interface ChartPoint {
  xLabel: string;
  value: number;
  displayValue: string;
}

export interface ChartSeries {
  id: string;
  label: string;
  tone: AccentTone;
  points: ChartPoint[];
}

export interface PortfolioChartViewModel {
  title: string;
  subtitle: string;
  periodLabel: string;
  minValue: number;
  maxValue: number;
  yTicks: AxisTick[];
  xLabels: string[];
  series: ChartSeries[];
  emptyMessage?: string;
}

export interface CampaignSignalViewModel {
  id: string;
  kind: SignalKind;
  name: string;
  sku: string;
  platform: string;
  roasDisplay: string;
  stockCoverDisplay: string;
  marginDisplay: string;
  summary: string;
}

export interface OverviewViewModel {
  metrics: MetricViewModel[];
  chart: PortfolioChartViewModel;
  signals: CampaignSignalViewModel[];
  keyMessage: string;
}

export interface CampaignRowViewModel {
  id: string;
  name: string;
  platform: string;
  sku: string;
  dailyBudgetDisplay: string;
  budgetValue: number;
  roasDisplay: string;
  spendDisplay: string;
  runwayDisplay: string;
  statusLabel: string;
  statusTone: "risk" | "neutral" | "warning";
}

export interface CampaignsViewModel {
  rows: CampaignRowViewModel[];
}

export interface BudgetMoveViewModel {
  id: string;
  name: string;
  platform: string;
  campaignId: string;
  sku: string;
  marginDisplay?: string;
  currentBudgetDisplay: string;
  proposedBudgetDisplay: string;
  changeDisplay: string;
}

export interface GuardrailViewModel {
  id: string;
  label: string;
  state: "satisfied" | "warning" | "blocked";
}

export interface WorkflowStageViewModel {
  id: string;
  label: string;
  state: "complete" | "active" | "pending";
}

export interface RecommendationViewModel {
  asOfDisplay: string;
  detectedAtDisplay: string;
  campaignName: string;
  campaignId: string;
  sku: string;
  platform: string;
  diagnosisLabel: string;
  runwayDisplay: string;
  warningThresholdDisplay: string;
  zScoreDisplay: string;
  evidence: string;
  donor: BudgetMoveViewModel;
  donors: BudgetMoveViewModel[];
  currentRunwayDisplay: string;
  receivers: BudgetMoveViewModel[];
  adjustedBudgetsDisplay: string;
  heldBackDisplay: string;
  expectedDailyContributionProfitDisplay: string;
  projectedThreeDayContributionProfitDisplay: string;
  guardrails: GuardrailViewModel[];
  confidenceDisplay: string;
  confidenceTrackPositionPercent: number;
  confidenceBand: string;
  confidenceRangeDisplay: string;
  confidenceStepCapDisplay: string;
  workflowStages: WorkflowStageViewModel[];
}

export interface LearningRecordViewModel {
  id: string;
  periodDisplay: string;
  predictedContributionProfitDisplay: string;
  actualContributionProfitDisplay: string;
  errorDisplay: string;
  confidenceBeforeDisplay: string;
  confidenceAfterDisplay: string;
  accuracyDisplay: string;
}

export interface LearningViewModel {
  modelName: string;
  currentConfidenceDisplay: string;
  confidenceNumericValue: number;
  confidenceRangeLabel: string;
  confidenceRangeMin: number;
  confidenceRangeMax: number;
  formulaAccuracy: string;
  formulaConfidence: string;
  stepCapDisplay: string;
  flowSteps: string[];
  pendingPredictionDisplay?: string;
  pendingPeriodDisplay?: string;
  records: LearningRecordViewModel[];
  confidenceHistory: Array<{ label: string; value: number; displayValue: string }>;
}

export interface DecisionHandlers {
  workflowStage?: import('./workflow-state').WorkflowStage;
  errorDisplay?: string;
  onApprove: () => void | Promise<void>;
  onReject: () => void | Promise<void>;
  onSimulate?: () => void | Promise<void>;
  actualDisplay?: string;
  confidenceAfterDisplay?: string;
  state: DecisionState;
  isBusy?: boolean;
  isPreview?: boolean;
  statusMessage?: string;
}
