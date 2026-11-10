// API（services/api）の呼び出し口。

/**
 * API のオリジン。空なら同じオリジンの /api を呼ぶ（Firebase Hosting の rewrite で Cloud Run に届く）。
 * localhost で画面と API を別々に動かすときは、NEXT_PUBLIC_API_BASE に API のオリジンを入れる（.env.example）。
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** API が 200 以外を返した（status が 429 なら、呼びすぎ） */
export class ApiError extends Error {
  constructor(
    path: string,
    readonly status: number,
  ) {
    super(`${path}: ${status}`);
  }
}

/** 返事を待つ長さの上限（ミリ秒）。Gemini の返事と、Cloud Run が起きるまでの時間を見込む */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * JSON を POST して、JSON の返事を受け取る。200 以外は ApiError にする。
 * timeoutMs を過ぎても返事がなければ打ち切る（待ち続けて画面が止まったままにならないように）。
 */
export async function postJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  // AbortSignal.any / AbortSignal.timeout は少し前のブラウザ（iOS 16 の Safari など）にないので、自前で組む
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = setTimeout(onAbort, timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new ApiError(path, res.status);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

let warmedUp = false;

/**
 * API を先に起こしておく。Cloud Run は使われていないと0まで縮むので、最初の呼び出しは起きるまで待たされる。
 * タグを選んでいる間に1回だけ呼んでおき、会話の1回目を待たせない。失敗しても何もしない。
 */
export function warmUpApi(): void {
  if (warmedUp) return;
  warmedUp = true;
  fetch(`${API_BASE}/api/health`).catch(() => {});
}
