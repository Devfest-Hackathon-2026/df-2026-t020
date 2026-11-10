// API（services/api）の呼び出し口。

/**
 * API のオリジン。空なら同じオリジンの /api を呼ぶ（Firebase Hosting の rewrite で Cloud Run に届く）。
 * localhost で画面と API を別々に動かすときは、NEXT_PUBLIC_API_BASE に API のオリジンを入れる（.env.example）。
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** JSON を POST して、JSON の返事を受け取る。200 以外はエラーにする */
export async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}
