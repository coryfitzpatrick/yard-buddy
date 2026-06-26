import type { Metadata } from "next";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { CookieConsent } from "@/components/CookieConsent";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { IosTrackingPrompt } from "@/components/mobile/IosTrackingPrompt";
import BiometricUnlockGate from "@/components/mobile/BiometricUnlockGate";
import ServiceWorkerRegistration from "@/components/mobile/ServiceWorkerRegistration";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Yard Analyzer",
  description: "Personalized lawn care assistant",
  applicationName: "Yard Analyzer",
  appleWebApp: {
    capable: true,
    title: "Yard Analyzer",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#16a34a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${roboto.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BiometricUnlockGate>{children}</BiometricUnlockGate>
        <CookieConsent />
        <IosTrackingPrompt />
        <ServiceWorkerRegistration />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
