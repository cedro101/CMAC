import type { Metadata, Viewport } from "next";
import PasscodeGate from "@/components/PasscodeGate";
import PwaSetup from "@/components/PwaSetup";
import TabBar from "@/components/TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "CMAC",
  description: "Cedric Macros: log food and weight by chatting.",
  appleWebApp: {
    capable: true,
    title: "CMAC",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="antialiased">
      <body>
        <PwaSetup />
        <PasscodeGate>
          <div className="flex h-dvh flex-col">
            <main className="pt-safe min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {children}
            </main>
            <TabBar />
          </div>
        </PasscodeGate>
      </body>
    </html>
  );
}
