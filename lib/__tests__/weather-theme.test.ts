import { describe, it, expect } from "vitest";
import { getWeatherTheme } from "../weatherTheme";

describe("getWeatherTheme", () => {
  it("returns sunny-day theme for clear sky day (01d)", () => {
    const theme = getWeatherTheme("01d");
    expect(theme.slot).toBe("sunny-day");
    expect(theme.textClass).toBe("text-white");
    expect(theme.gradient).toContain("from-");
  });

  it("returns clear-night theme for clear sky night (01n)", () => {
    const theme = getWeatherTheme("01n");
    expect(theme.slot).toBe("clear-night");
    expect(theme.textClass).toBe("text-white");
  });

  it("returns partly-cloudy-day for few clouds day (02d)", () => {
    expect(getWeatherTheme("02d").slot).toBe("partly-cloudy-day");
  });

  it("returns partly-cloudy-night for scattered clouds night (03n)", () => {
    expect(getWeatherTheme("03n").slot).toBe("partly-cloudy-night");
  });

  it("returns cloudy for broken clouds day (04d)", () => {
    expect(getWeatherTheme("04d").slot).toBe("cloudy");
  });

  it("returns cloudy-night for broken clouds night (04n)", () => {
    expect(getWeatherTheme("04n").slot).toBe("cloudy-night");
  });

  it("returns rainy for shower rain day (09d)", () => {
    expect(getWeatherTheme("09d").slot).toBe("rainy");
  });

  it("returns rainy-night for rain night (10n)", () => {
    expect(getWeatherTheme("10n").slot).toBe("rainy-night");
  });

  it("returns storm for thunderstorm day (11d)", () => {
    expect(getWeatherTheme("11d").slot).toBe("storm");
    expect(getWeatherTheme("11d").textClass).toBe("text-white");
  });

  it("returns storm-night for thunderstorm night (11n)", () => {
    expect(getWeatherTheme("11n").slot).toBe("storm-night");
  });

  it("returns snow for snow day (13d)", () => {
    const theme = getWeatherTheme("13d");
    expect(theme.slot).toBe("snow");
    expect(theme.textClass).toBe("text-gray-800");
  });

  it("returns snow-night for snow night (13n)", () => {
    const theme = getWeatherTheme("13n");
    expect(theme.slot).toBe("snow-night");
    expect(theme.textClass).toBe("text-white");
  });

  it("returns foggy for mist (50d and 50n)", () => {
    expect(getWeatherTheme("50d").slot).toBe("foggy");
    expect(getWeatherTheme("50n").slot).toBe("foggy");
    expect(getWeatherTheme("50d").textClass).toBe("text-gray-800");
  });

  it("falls back to sunny-day for unknown day icon", () => {
    expect(getWeatherTheme("99d").slot).toBe("sunny-day");
  });

  it("falls back to clear-night for unknown night icon", () => {
    expect(getWeatherTheme("99n").slot).toBe("clear-night");
  });

  it("falls back to sunny-day for malformed icon string", () => {
    expect(getWeatherTheme("").slot).toBe("sunny-day");
  });
});
