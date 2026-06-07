export type AreaType =
  | "front"
  | "back"
  | "left_side"
  | "right_side"
  | "garden"
  | "other";

export type GrassType =
  | "bermuda"
  | "kentucky_bluegrass"
  | "tall_fescue"
  | "fine_fescue"
  | "zoysia"
  | "st_augustine"
  | "centipede"
  | "buffalo"
  | "ryegrass"
  | "unknown";

export type SpreadType = "broadcast" | "drop" | "handheld" | "liquid" | "none";

export type LawnIssue =
  | "grubs"
  | "weeds_broadleaf"
  | "weeds_grassy"
  | "fungus"
  | "drought_stress"
  | "overwatering"
  | "bare_spots"
  | "thatch"
  | "compaction"
  | "nutrient_deficiency"
  | "pests"
  | "healthy";

export type TaskStatus = "pending" | "completed" | "skipped";
export type TaskPriority = "urgent" | "high" | "medium" | "low";

export interface WeatherData {
  temp: number;
  humidity: number;
  description: string;
  icon: string;
  windSpeed: number;
  precipitationChance: number;
  location: string;
  forecast: Array<{ date: string; high: number; low: number; description: string }>;
}

export interface AnalysisResult {
  issues: LawnIssue[];
  healthScore: number;
  summary: string;
  recommendations: RecommendationItem[];
  grassTypeDetected?: GrassType;
  confidence?: number;
}

export interface RecommendationItem {
  title: string;
  description: string;
  priority: TaskPriority;
  timing: string;
  productSuggestion?: string;
  productSearchQuery?: string;
  estimatedPrice?: string;
  applicationRate?: string;
  spreaderSetting?: string;
  spreaderType?: SpreadType;
}
