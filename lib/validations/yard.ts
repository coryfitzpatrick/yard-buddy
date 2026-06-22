import { z } from "zod";

export const yardSchema = z.object({
  name: z.string().min(1).default("My Property"),
  zipCode: z.string().regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code"),
  city: z.string().optional(),
  state: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  spreaderType: z.enum(["broadcast", "drop", "handheld", "liquid", "none"]).optional(),
  spreaderModel: z.string().optional(),
  streetAddress: z.string().optional(),
  lotSqft: z.number().int().positive().optional(),
  buildingSqft: z.number().int().positive().optional(),
  wateringMinutesPerSession: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(120).optional()
  ),
  mowingHeightInches: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(1).max(5).optional()
  ),
  wateringDays: z.array(z.enum(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"])).optional(),
  wateringTime: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.string().regex(/^\d{2}:\d{2}$/).optional()
  ),
  mowingDays: z.array(z.enum(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"])).optional(),
  mowingTime: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.string().regex(/^\d{2}:\d{2}$/).optional()
  ),
});

export type YardInput = z.infer<typeof yardSchema>;

export const yardSectionSchema = z.object({
  name: z.string().min(1).default("Front Yard"),
  areaType: z.enum(["front", "back", "left_side", "right_side", "other"]).optional(),
  yardSizeSqft: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(1).max(500000).optional()
  ),
  grassType: z.enum([
    "bermuda", "kentucky_bluegrass", "tall_fescue", "fine_fescue",
    "zoysia", "st_augustine", "centipede", "buffalo", "ryegrass", "unknown",
  ]),
  soilPh: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(4).max(9).optional()
  ),
  nitrogenPpm: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0).max(1000).optional()
  ),
  phosphorusPpm: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0).max(2000).optional()
  ),
  potassiumPpm: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0).max(2000).optional()
  ),
  organicMatterPct: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0).max(100).optional()
  ),
  soilTestSource: z.string().max(200).optional(),
  soilTestedAt: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : new Date(v as string)),
    z.date().optional()
  ),
  soilMoisture: z.enum(["dry", "moderate", "moist"]).optional(),
  notes: z.string().max(2000).optional(),
  wateringMinutesPerSession: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(1).optional()
  ),
  mowingHeightInches: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(1).max(5).optional()
  ),
  wateringDays: z.array(z.enum(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"])).optional(),
  wateringTime: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.string().regex(/^\d{2}:\d{2}$/).optional()
  ),
  mowingDays: z.array(z.enum(["Sun","Mon","Tue","Wed","Thu","Fri","Sat"])).optional(),
  mowingTime: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.string().regex(/^\d{2}:\d{2}$/).optional()
  ),
});

export type YardSectionInput = z.infer<typeof yardSectionSchema>;
export type YardSectionFormInput = z.input<typeof yardSectionSchema>;
