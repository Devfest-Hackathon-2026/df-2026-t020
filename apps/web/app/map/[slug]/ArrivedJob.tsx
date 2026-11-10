"use client";

// 仕事の街や診断の結果から「#job-<職業カードの id>」で移ってきたとき、そのカードまで移って目立たせる。
// アプリの中のリンクで移ると CSS の :target が効かないので、ここで印（data-arrived）を付ける。

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function ArrivedJob() {
  const pathname = usePathname();
  useEffect(() => {
    let marked: HTMLElement | null = null;
    const mark = () => {
      marked?.removeAttribute("data-arrived");
      marked = null;
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id.startsWith("job-")) return;
      marked = document.getElementById(id);
      if (!marked) return;
      marked.setAttribute("data-arrived", "");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      marked.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    };
    mark();
    window.addEventListener("hashchange", mark);
    return () => {
      window.removeEventListener("hashchange", mark);
      marked?.removeAttribute("data-arrived");
    };
  }, [pathname]);
  return null;
}
