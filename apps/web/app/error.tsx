"use client";

// 画面の中で予期しないエラーが起きたときに出す（白い画面のままにしない）。
// 「もう一度試す」で、その画面を描き直す。

import Link from "next/link";
import { useEffect } from "react";
import styles from "./not-found.module.css";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.notFound} role="alert">
      <h1 className={styles.title}>うまく表示できませんでした</h1>
      <p className={styles.actions}>
        <button type="button" className={styles.retry} onClick={() => retry()}>
          もう一度試す
        </button>
        <Link className={styles.link} href="/">
          ホームに戻る
        </Link>
      </p>
    </div>
  );
}
