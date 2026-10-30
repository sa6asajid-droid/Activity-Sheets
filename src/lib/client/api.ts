"use client";
/** Browser-side fetch helpers. Errors carry the server's user-facing message. */

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly issues?: { code: string; message: string }[]) {
    super(message);
  }
}

export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let issues;
    try {
      const b = await res.json();
      msg = b.error ?? msg;
      issues = b.issues;
    } catch {
      /* not json */
    }
    throw new ApiError(msg, res.status, issues);
  }
  return res.json() as Promise<T>;
}

/** POST and save the response as a file download. */
export async function download(url: string, body: unknown): Promise<{ draft: boolean; notes?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    let issues;
    try {
      const b = await res.json();
      msg = b.error ?? msg;
      issues = b.issues;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status, issues);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "export";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { draft: res.headers.get("X-Export-Draft") === "1", notes: decodeURIComponent(res.headers.get("X-Workbook-Notes") ?? "") };
}
