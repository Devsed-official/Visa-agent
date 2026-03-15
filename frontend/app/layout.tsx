import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const integralCF = localFont({
  src: [
    {
      path: "./fonts/integralcf/IntegralCF-Regular.woff",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/integralcf/IntegralCF-Medium.woff",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/integralcf/IntegralCF-Bold.woff",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-integral-cf",
  display: "swap",
  preload: true,
});

const interDisplay = localFont({
  src: [
    {
      path: "./fonts/interdisplay/InterDisplay-Regular.woff",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/interdisplay/InterDisplay-Italic.woff",
      weight: "400",
      style: "italic",
    },
    {
      path: "./fonts/interdisplay/InterDisplay-Medium.woff",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/interdisplay/InterDisplay-MediumItalic.woff",
      weight: "500",
      style: "italic",
    },
    {
      path: "./fonts/interdisplay/InterDisplay-SemiBold.woff",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/interdisplay/InterDisplay-SemiBoldItalic.woff",
      weight: "600",
      style: "italic",
    },
    {
      path: "./fonts/interdisplay/InterDisplay-Bold.woff",
      weight: "700",
      style: "normal",
    },
    {
      path: "./fonts/interdisplay/InterDisplay-BoldItalic.woff",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-inter-display",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "Visa Interview Agent",
  description: "Practice your visa interview with an AI interviewer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${integralCF.variable} ${interDisplay.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
