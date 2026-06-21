export const TOKEN = "YardAnalyzerApp/";

export function isMobileAppClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(TOKEN);
}
