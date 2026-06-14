import type { GrassType } from "@/types";

export type RagTopic =
  | "pre-emergent"
  | "fertilization"
  | "mowing"
  | "irrigation"
  | "soil-ph-acidic"
  | "soil-ph-alkaline"
  | "disease"
  | "pest"
  | "weed-control"
  | "overseeding"
  | "aeration"
  | "drought"
  | "winter-care"
  | "spring-green-up"
  | "general";

export type RagRegion =
  | "northeast"
  | "midwest"
  | "southeast"
  | "south-central"
  | "southwest"
  | "mountain-west"
  | "pacific-northwest"
  | "national";

export interface DocFrontmatter {
  source: string;
  url: string;
  grassType: GrassType[] | "any";
  topic: RagTopic[];
  region: RagRegion[];
  title?: string;
}

export interface Chunk {
  id: string;
  source: string;
  url: string;
  title: string;
  grassType: GrassType[] | "any";
  topic: RagTopic[];
  region: RagRegion[];
  text: string;
}

export interface RetrievalContext {
  grassType: GrassType;
  scenarioText: string;
  topicHints?: RagTopic[];
  region?: RagRegion;
  k?: number;
}
