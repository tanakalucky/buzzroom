import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "buzzroom — 仲間と楽しむ早押しクイズ",
  description: "招待制のルームで、仲間と早押しクイズ。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="header-inner">
            <a className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                ϟ
              </span>
              buzzroom
            </a>
            <span className="header-note">仲間と楽しむ、早押しクイズ</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
