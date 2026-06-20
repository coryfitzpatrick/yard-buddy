import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yardanalyzer.app",
  appName: "Yard Analyzer",
  webDir: "public",
  server: {
    url: "https://yardanalyzer.com",
    cleartext: false,
  },
  appendUserAgent: "YardAnalyzerApp/1.0",
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1a4d2e",
      launchAutoHide: true,
    },
    StatusBar: {
      style: "DARK",
    },
  },
};

export default config;
