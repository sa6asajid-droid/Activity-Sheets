"use client";
/**
 * Working-document state for the editor: undo/redo history, debounced
 * autosave with optimistic version checks, and the latest browser layout
 * measurements (sent with each save so the server's checks see real overflow).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { QualityReport, WorksheetDocument } from "../schema/document";
import type { MeasuredPage } from "../quality/checks";
import { api, ApiError } from "./api";

export type SaveState = "saved" | "pending" | "saving" | "error" | "conflict";

const MAX_HISTORY = 100;

export function useDocument(projectId: string, initial: WorksheetDocument | null, initialVersion: number) {
  const [doc, setDocState] = useState<WorksheetDocument | null>(initial);
  const [past, setPast] = useState<WorksheetDocument[]>([]);
  const [future, setFuture] = useState<WorksheetDocument[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [measured, setMeasured] = useState<MeasuredPage[] | null>(null);
  const version = useRef(initialVersion);
  const dirty = useRef(false);
  const latest = useRef(doc);
  const measuredRef = useRef(measured);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  latest.current = doc;
  measuredRef.current = measured;

  /** Replace the document from the server (after generation, restore, accept). */
  const reset = useCallback((d: WorksheetDocument | null, v: number) => {
    setDocState(d);
    setPast([]);
    setFuture([]);
    version.current = v;
    dirty.current = false;
    setSaveState("saved");
  }, []);

  const save = useCallback(async () => {
    if (!dirty.current || !latest.current) return;
    if (inflight.current) await inflight.current;
    dirty.current = false;
    const sending = latest.current;
    setSaveState("saving");
    const p = (async () => {
      try {
        const r = await api<{ version: number; qualityReport: QualityReport }>(`/api/projects/${projectId}/draft`, {
          method: "PUT",
          json: { doc: sending, baseVersion: version.current, measuredPages: measuredRef.current ?? undefined },
        });
        version.current = r.version;
        // Merge the fresh report without creating an undo step.
        setDocState((d) => (d ? { ...d, qualityReport: r.qualityReport } : d));
        setSaveError(null);
        setSaveState(dirty.current ? "pending" : "saved");
      } catch (e) {
        dirty.current = true;
        if (e instanceof ApiError && e.status === 409) setSaveState("conflict");
        else setSaveState("error");
        setSaveError((e as Error).message);
      }
    })();
    inflight.current = p;
    await p;
    inflight.current = null;
  }, [projectId]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setSaveState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1000);
  }, [save]);

  const setDoc = useCallback(
    (update: (d: WorksheetDocument) => WorksheetDocument) => {
      setDocState((cur) => {
        if (!cur) return cur;
        const next = update(cur);
        if (next === cur) return cur;
        setPast((p) => [...p.slice(-MAX_HISTORY + 1), cur]);
        setFuture([]);
        return next;
      });
      schedule();
    },
    [schedule],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setDocState((cur) => {
        if (cur) setFuture((f) => [cur, ...f]);
        return prev;
      });
      return p.slice(0, -1);
    });
    schedule();
  }, [schedule]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setDocState((cur) => {
        if (cur) setPast((p) => [...p, cur]);
        return next;
      });
      return f.slice(1);
    });
    schedule();
  }, [schedule]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await save();
  }, [save]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  return { doc, setDoc, reset, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0, saveState, saveError, flush, measured, setMeasured, version };
}
