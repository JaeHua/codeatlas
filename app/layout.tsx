import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import { ClientLayout } from "@/app/components/layout/ClientLayout";
import "./globals.css";

const spaceGrotesk = localFont({
  src: [
    { path: "./fonts/space-grotesk-300.ttf", weight: "300", style: "normal" },
    { path: "./fonts/space-grotesk-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/space-grotesk-500.ttf", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk-600.ttf", weight: "600", style: "normal" },
    { path: "./fonts/space-grotesk-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CodeAtlas — Interactive Source Code Map",
  description:
    "像浏览地图一样探索源码。文件画像、核心函数、调用关系、知识图谱与推荐阅读路径，绘制成一张可以缩放、标记和探索的源码工程图纸。",
};

const THEME_SCRIPT = `
(function() {
  var vars = {
    "--background":"#FBF8F0","--foreground":"#1A1A18","--card":"#FFFFFF","--card-foreground":"#1A1A18",
    "--primary":"#E0A93C","--primary-foreground":"#1A1A18","--secondary":"#F3EFE6","--secondary-foreground":"#4A463E",
    "--muted":"#F3EFE6","--muted-foreground":"#8A8578","--accent":"#F3EFE6","--accent-foreground":"#4A463E",
    "--border":"#E2DDD2","--input":"#E2DDD2","--ring":"#E0A93C","--radius":"2px"
  };
  try {
    var raw = localStorage.getItem('codeatlas-theme');
    var data = raw ? JSON.parse(raw) : null;
    var state = data && data.state ? data.state : { customColors: {} };
    if (state.customColors) { for (var k in state.customColors) vars[k] = state.customColors[k]; }
    for (var k in vars) document.documentElement.style.setProperty(k, vars[k]);
  } catch(e) {}
})();
`

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">{THEME_SCRIPT}</Script>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
