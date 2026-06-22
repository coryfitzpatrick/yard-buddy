import { describe, it, expect } from "vitest";
import { buildWeatherAlerts } from "@/lib/email/weather-alerts";

const today = new Date("2026-06-22T00:00:00Z"); // a Monday

describe("buildWeatherAlerts", () => {
  it("returns empty when no sections", () => {
    expect(buildWeatherAlerts({ sections: [], forecastByZip: new Map(), today })).toEqual([]);
  });

  it("returns empty when sections have no scheduled days in the next 5 days", () => {
    const result = buildWeatherAlerts({
      sections: [{
        yardName: "Home",
        yardZip: "30301",
        effectiveWatering: { days: [], time: null, minutesPerSession: null },
        effectiveMowing: { days: [], time: null, heightInches: null },
      }],
      forecastByZip: new Map([["30301", [
        { date: today, chanceOfRain: 0.9, rainfallInches: 1.0 },
      ]]]),
      today,
    });
    expect(result).toEqual([]);
  });

  it("returns a watering alert when a scheduled watering day has rain forecast (>=50%)", () => {
    const wed = new Date("2026-06-24T00:00:00Z");
    const result = buildWeatherAlerts({
      sections: [{
        yardName: "Home",
        yardZip: "30301",
        effectiveWatering: { days: ["Wed"], time: "07:00", minutesPerSession: 20 },
        effectiveMowing: { days: [], time: null, heightInches: null },
      }],
      forecastByZip: new Map([["30301", [
        { date: wed, chanceOfRain: 0.7, rainfallInches: 0 },
      ]]]),
      today,
    });
    expect(result).toEqual([
      { yardName: "Home", date: "Wednesday, June 24", kind: "watering", reason: "Rain expected (70%)" },
    ]);
  });

  it("uses tighter threshold for mowing (>= 0.10 inches)", () => {
    const sat = new Date("2026-06-27T00:00:00Z");
    const result = buildWeatherAlerts({
      sections: [{
        yardName: "Home",
        yardZip: "30301",
        effectiveWatering: { days: [], time: null, minutesPerSession: null },
        effectiveMowing: { days: ["Sat"], time: "08:00", heightInches: 3.0 },
      }],
      forecastByZip: new Map([["30301", [
        { date: sat, chanceOfRain: 0.2, rainfallInches: 0.15 }, // below watering, above mowing
      ]]]),
      today,
    });
    expect(result).toEqual([
      { yardName: "Home", date: "Saturday, June 27", kind: "mowing", reason: "Rain expected (20%)" },
    ]);
  });

  it("returns multiple alerts when both watering and mowing days have rain", () => {
    const wed = new Date("2026-06-24T00:00:00Z");
    const result = buildWeatherAlerts({
      sections: [{
        yardName: "Home",
        yardZip: "30301",
        effectiveWatering: { days: ["Wed"], time: "07:00", minutesPerSession: 20 },
        effectiveMowing: { days: ["Wed"], time: "08:00", heightInches: 3.0 },
      }],
      forecastByZip: new Map([["30301", [
        { date: wed, chanceOfRain: 0.6, rainfallInches: 0.3 },
      ]]]),
      today,
    });
    expect(result).toHaveLength(2);
  });

  it("skips zips not in forecastByZip", () => {
    const result = buildWeatherAlerts({
      sections: [{
        yardName: "Home",
        yardZip: "99999",
        effectiveWatering: { days: ["Mon"], time: "07:00", minutesPerSession: 20 },
        effectiveMowing: { days: [], time: null, heightInches: null },
      }],
      forecastByZip: new Map([["30301", [
        { date: today, chanceOfRain: 0.9, rainfallInches: 1.0 },
      ]]]),
      today,
    });
    expect(result).toEqual([]);
  });
});
