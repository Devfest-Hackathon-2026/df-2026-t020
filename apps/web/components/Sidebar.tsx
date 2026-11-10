"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { industries } from "@/data/industries";
import styles from "./Sidebar.module.css";

const NARROW = "(max-width: 720px)";

function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export default function Sidebar() {
  const pathname = usePathname();
  const isNarrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
  // スマホ幅では一覧がホームを押し下げないよう、操作するまで閉じておく
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? !isNarrow;

  const currentIf = (href: string) => (pathname === href ? "page" : undefined);

  return (
    <aside className={styles.sidebar}>
      <nav aria-label="メインメニュー">
        <ul className={styles.nav}>
          <li>
            <Link className={styles.item} href="/" aria-current={currentIf("/")}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m3 9 7-6 7 6v8h-5v-5H8v5H3z" />
              </svg>
              ホーム
            </Link>
          </li>
          <li>
            <Link className={styles.item} href="/map" aria-current={currentIf("/map")}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m10 2.5 7 3.5-7 3.5-7-3.5z" />
                <path d="m3 10 7 3.5 7-3.5" />
                <path d="m3 14 7 3.5 7-3.5" />
              </svg>
              仕事の街
            </Link>
          </li>
          <li>
            <Link className={styles.item} href="/history" aria-current={currentIf("/history")}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 10a6.5 6.5 0 1 0 2-4.7" />
                <path d="M3 3v3.5h3.5" />
                <path d="M10 6.5V10l2.5 2" />
              </svg>
              過去の結果
            </Link>
          </li>
          <li>
            <button
              className={styles.item}
              type="button"
              aria-expanded={open}
              aria-controls="industries"
              onClick={() => setChoice(!open)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m2.5 5 5-2 5 2 5-2v12l-5 2-5-2-5 2z" />
                <path d="M7.5 3v12M12.5 5v12" />
              </svg>
              業界地図
              <svg className={styles.chevron} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m4 6 4 4 4-4" />
              </svg>
            </button>
            <ul className={styles.industries} id="industries" hidden={!open}>
              {industries.map(({ slug, name }) => {
                const href = `/map/${slug}`;
                return (
                  <li key={slug}>
                    <Link className={styles.item} href={href} aria-current={currentIf(href)}>
                      {name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        </ul>
      </nav>
    </aside>
  );
}
