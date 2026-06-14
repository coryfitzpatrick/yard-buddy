import type { GrassType } from "@/types";

export type ProductCategory =
  | "lime"
  | "broadleaf-herbicide"
  | "pre-emergent"
  | "fertilizer"
  | "soil-acidifier"
  | "iron";

export type Product = {
  name: string;
  brand?: string;
  category: ProductCategory;
  activeIngredients?: string[];

  limeType?: "calcitic" | "dolomitic" | "ca-mg";
  containsMg?: boolean;

  tempMinF?: number;
  tempNotes?: string;

  bannedFor?: GrassType[];
  notesPerGrass?: Partial<Record<GrassType, string>>;

  notes?: string;
};

export type RegionalTool = {
  stateCode: string;
  zipPrefixes: string[];
  soilTempTool: {
    name: string;
    url: string;
    ownedBy: string;
  };
};
