import * as fs from "fs";
import * as path from "path";
import type { ImagePhotoRef } from "./types-image";

const PHOTOS_ROOT = path.join(__dirname, "photos");

export type Base64Image = {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png"; data: string };
};

function inferMediaType(filePath: string): "image/jpeg" | "image/png" {
  if (filePath.toLowerCase().endsWith(".png")) return "image/png";
  return "image/jpeg";
}

export function loadPhotosForScenario(scenarioId: string, photos: ImagePhotoRef[]): Base64Image[] {
  return photos.map((photo) => {
    const fullPath = path.join(PHOTOS_ROOT, scenarioId, photo.path);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Missing photo for ${scenarioId}: ${fullPath}`);
    }
    const data = fs.readFileSync(fullPath).toString("base64");
    return {
      type: "image",
      source: { type: "base64", media_type: inferMediaType(fullPath), data },
    };
  });
}

export function asImageUrlsForAnalyzeImages(scenarioId: string, photos: ImagePhotoRef[]): string[] {
  return photos.map((photo) => `file://${path.join(PHOTOS_ROOT, scenarioId, photo.path)}`);
}
