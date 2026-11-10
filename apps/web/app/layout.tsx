import type { Metadata, Viewport } from "next";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import "./globals.css";
import styles from "./layout.module.css";

const description = "好きなことを選んで質問に答えると、まだ知らないかもしれない仕事を紹介します";

export const metadata: Metadata = {
  title: "Eureka",
  description,
  // リンクを貼ったときに出る名前と説明
  openGraph: { title: "Eureka", description, siteName: "Eureka", type: "website", locale: "ja_JP" },
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>
        <Header />
        <div className={styles.shell}>
          <Sidebar />
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}
