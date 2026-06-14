import { GrassType } from "@/types";
import { BASE_PROMPT } from "./base";
import { WARM_SEASON_PROMPT } from "./shared/warm-season";
import { COOL_SEASON_PROMPT } from "./shared/cool-season";
import { CENTIPEDE_PROMPT } from "./grass/centipede";
import { KENTUCKY_BLUEGRASS_PROMPT } from "./grass/kentucky-bluegrass";
import { ST_AUGUSTINE_PROMPT } from "./grass/st-augustine";
import { BERMUDA_PROMPT } from "./grass/bermuda";
import { ZOYSIA_PROMPT } from "./grass/zoysia";
import { RYEGRASS_PROMPT } from "./grass/ryegrass";
import { TALL_FESCUE_PROMPT } from "./grass/tall-fescue";
import { FINE_FESCUE_PROMPT } from "./grass/fine-fescue";
import { BUFFALO_PROMPT } from "./grass/buffalo";
import { UNKNOWN_GRASS_PROMPT } from "./grass/unknown";

const WARM_SEASON: ReadonlySet<GrassType> = new Set<GrassType>([
  "bermuda",
  "zoysia",
  "st_augustine",
  "centipede",
  "buffalo",
]);

const COOL_SEASON: ReadonlySet<GrassType> = new Set<GrassType>([
  "kentucky_bluegrass",
  "tall_fescue",
  "fine_fescue",
  "ryegrass",
]);

const GRASS_PROMPTS: Record<GrassType, string> = {
  bermuda: BERMUDA_PROMPT,
  zoysia: ZOYSIA_PROMPT,
  st_augustine: ST_AUGUSTINE_PROMPT,
  centipede: CENTIPEDE_PROMPT,
  buffalo: BUFFALO_PROMPT,
  kentucky_bluegrass: KENTUCKY_BLUEGRASS_PROMPT,
  tall_fescue: TALL_FESCUE_PROMPT,
  fine_fescue: FINE_FESCUE_PROMPT,
  ryegrass: RYEGRASS_PROMPT,
  unknown: UNKNOWN_GRASS_PROMPT,
};

export function isWarmSeason(grassType: GrassType): boolean {
  return WARM_SEASON.has(grassType);
}

export function isCoolSeason(grassType: GrassType): boolean {
  return COOL_SEASON.has(grassType);
}

export function buildSystemPrompt(grassType: GrassType): string {
  const parts: string[] = [BASE_PROMPT];

  if (WARM_SEASON.has(grassType)) parts.push(WARM_SEASON_PROMPT);
  if (COOL_SEASON.has(grassType)) parts.push(COOL_SEASON_PROMPT);

  const grassSpecific = GRASS_PROMPTS[grassType];
  if (grassSpecific) parts.push(grassSpecific);

  return parts.join("\n\n");
}
