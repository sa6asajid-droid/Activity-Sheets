"use client";
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }>(function Button(
  { variant = "secondary", size = "md", className = "", ...props },
  ref,
) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = size === "sm" ? "px-2.5 py-1 text-sm" : "px-3.5 py-2 text-[0.95rem]";
  const variants: Record<Variant, string> = {
    primary: "bg-accent text-accent-ink hover:bg-[#174a6c]",
    secondary: "bg-card text-ink border border-line hover:bg-[#f0ece2]",
    ghost: "text-ink hover:bg-[#ece7dc]",
    danger: "bg-card text-bad border border-[#e2b4b6] hover:bg-[#fbeeee]",
  };
  return <button ref={ref} className={`${base} ${sizes} ${variants[variant]} ${className}`} {...props} />;
});

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Card({ children, className = "", as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={`bg-card border border-line rounded-lg ${className}`}>{children}</As>;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-[#ecebe6] text-ink",
  "needs-review": "bg-[#fbefd5] text-warn",
  approved: "bg-[#e1efe2] text-ok",
  exported: "bg-[#dde9f3] text-info",
  blocking: "bg-[#f8e1e2] text-bad",
  warning: "bg-[#fbefd5] text-warn",
  info: "bg-[#e5edf3] text-info",
  ok: "bg-[#e1efe2] text-ok",
};

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[tone] ?? STATUS_STYLES.draft}`}>{children}</span>;
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning" | "blocking" | "ok"; title?: string; children: ReactNode }) {
  const border = { info: "border-info", warning: "border-warn", blocking: "border-bad", ok: "border-ok" }[tone];
  return (
    <div role={tone === "blocking" ? "alert" : "status"} className={`border-l-4 ${border} bg-card rounded-r-md px-3 py-2 text-sm`}>
      {title && <p className="font-semibold mb-0.5">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-bad">
      {error}
    </p>
  );
}
