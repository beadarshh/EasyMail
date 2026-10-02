import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { SpecularLight } from "@/components/specular-light";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "EasyMail", template: "%s · EasyMail" },
  description: "Personal email platform on Resend — send, receive and track mail for all your projects.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Rendered on the server from the cookie, so there's no flash of the wrong theme.
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html
      lang="en"
      data-theme={theme === "light" || theme === "dark" ? theme : undefined}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        {children}
        <SpecularLight />
      </body>
    </html>
  );
}
