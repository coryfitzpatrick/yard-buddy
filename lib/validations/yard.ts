import { z } from "zod";

export const yardSchema = z.object({
  name: z.string().min(1).default("My Property"),
  zipCode: z.string().regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code"),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export type YardInput = z.infer<typeof yardSchema>;

export const yardSectionSchema = z.object({
  name: z.string().min(1).default("Front Yard"),
  areaType: z.enum(["front", "back", "left_side", "right_side", "garden", "other"]).optional(),
  yardSizeSqft: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(100).max(100000).optional()
  ),
  grassType: z.enum([
    "bermuda", "kentucky_bluegrass", "tall_fescue", "fine_fescue",
    "zoysia", "st_augustine", "centipede", "buffalo", "ryegrass", "unknown",
  ]),
  soilPh: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(4).max(9).optional()
  ),
  soilMoisture: z.enum(["dry", "moderate", "moist"]).optional(),
  spreaderType: z.enum(["broadcast", "drop", "handheld", "liquid", "none"]).optional(),
  spreaderModel: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export type YardSectionInput = z.infer<typeof yardSectionSchema>;
export type YardSectionFormInput = z.input<typeof yardSectionSchema>;
