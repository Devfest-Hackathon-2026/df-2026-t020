"use client";

import Link from "next/link";
import { startOver } from "@/data/visitMemory";
import styles from "./Header.module.css";

// 全ページの上に出すヘッダー。アプリの名前（Eureka）を出し、押すとホームの最初の画面（好きなものを選ぶ1回目）へもどる。
// 診断の途中は忘れる（サイドバーの「ホーム」は、途中から続けられるように覚えたまま移る）。
export default function Header() {
  return (
    <header className={styles.header}>
      <Link className={styles.logo} href="/" aria-label="Eureka 最初のページへ" onClick={startOver}>
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <circle cx="13" cy="13" r="12" fill="var(--rose)" />
          <path d="M13 6.5v3M13 16.5v3M6.5 13h3M16.5 13h3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="13" cy="13" r="2.2" fill="#fff" />
        </svg>
        <span className={styles.name}>Eureka</span>
      </Link>
      <span className={styles.tagline}>まだ知らない仕事に出会う</span>
    </header>
  );
}
