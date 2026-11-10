import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.notFound}>
      <h1 className={styles.title}>ページが見つかりません</h1>
      <Link className={styles.link} href="/">
        ホームに戻る
      </Link>
    </div>
  );
}
