"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Submission } from "@/app/page";
import {
  streamPreopRun,
  type PreopRunResult,
  type PreopStreamEvent,
} from "@/lib/preop";

const FRAMES = [
  { n: 1, label: "Healthy baseline" },
  { n: 2, label: "The injury" },
  { n: 3, label: "Beginning the repair" },
  { n: 4, label: "The moment of repair" },
  { n: 5, label: "Your healed body" },
  { n: 6, label: "Returning to life" },
] as const;

const STAGE_NARRATION: Record<string, string> = {
  starting: "Reading your diagnosis.",
  sdk_init: "Preparing the scene.",
  painting: "Painting the anatomy in your style.",
  filming: "Bringing each frame to life.",
  composing: "Combining the chapters into one film.",
  storing: "Saving your film.",
  storage_warning: "Using the temporary video link.",
};

export default function Processing({
  submission,
  onDone,
  onBack,
}: {
  submission: Submission;
  onDone: (result: PreopRunResult) => void;
  onBack: () => void;
}) {
  const [events, setEvents] = useState<PreopStreamEvent[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef<number>(performance.now());

  useEffect(() => {
    const abortController = new AbortController();
    const startTimer = window.setTimeout(() => {
      streamPreopRun(
        submission.diagnosis,
        submission.runId,
        (event) => {
          setEvents((current) => [...current, event]);
          if (event.type === "done") onDone(event.result);
          if (event.type === "error") setError(event.error);
        },
        abortController.signal,
      ).catch((err) => {
        if (abortController.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    }, 100);

    return () => {
      window.clearTimeout(startTimer);
      abortController.abort();
    };
  }, [onDone, submission.diagnosis, submission.runId]);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed((performance.now() - startedRef.current) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, []);

  const frames = useMemo(() => {
    const stills = new Map<number, string>();
    const clips = new Set<number>();
    for (const e of events) {
      if (e.type === "artifact") {
        if (e.kind === "image") stills.set(e.index, e.url);
        else if (e.kind === "video") clips.add(e.index);
      }
    }
    return FRAMES.map((f) => ({
      ...f,
      stillUrl: stills.get(f.n) ?? null,
      hasClip: clips.has(f.n),
    }));
  }, [events]);

  const latestStatus = [...events]
    .reverse()
    .find((event) => event.type === "status");
  const stageKey =
    latestStatus?.type === "status" ? latestStatus.stage : "starting";
  const narration =
    STAGE_NARRATION[stageKey] ??
    (latestStatus?.type === "status"
      ? latestStatus.message
      : "Opening the session.");

  const breathingIndex = (() => {
    if (error) return -1;
    if (stageKey === "starting" || stageKey === "sdk_init") return 0;
    if (stageKey === "painting") {
      return frames.findIndex((f) => !f.stillUrl);
    }
    if (stageKey === "filming") {
      return frames.findIndex((f) => !f.hasClip);
    }
    return -1;
  })();

  const activeLabel = (() => {
    if (error) return "Generation paused";
    if (stageKey === "starting" || stageKey === "sdk_init")
      return "Opening the session";
    if (stageKey === "storing") return "Saving your film";
    if (stageKey === "storage_warning") return "Film ready";
    if (breathingIndex === -1) return "Final touches";
    return frames[breathingIndex].label;
  })();

  return (
    <div className="w-full max-w-[640px] animate-fade-up">
      <header className="mb-10">
        <div className="mb-6 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-terracotta animate-pulse-dot" />
          </span>
          <span>Composing your film</span>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
            {formatTime(elapsed)}
          </span>
        </div>
        <h2 className="font-display text-[34px] leading-[1.05] font-light text-ink sm:text-[40px]">
          Frame by frame,
          <br />
          just for{" "}
          <em className="italic font-normal text-terracotta">you</em>.
        </h2>
      </header>

      <div className="mb-8 grid grid-cols-6 gap-1.5 sm:gap-2.5">
        {frames.map((frame, idx) => {
          const hasStill = !!frame.stillUrl;
          const isActive = idx === breathingIndex;
          const isWaiting = !hasStill && !isActive;
          return (
            <div
              key={frame.n}
              className={[
                "relative overflow-hidden rounded-md border transition-[border-color,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] aspect-[9/16]",
                hasStill
                  ? "border-line-strong opacity-100"
                  : isActive
                    ? "border-terracotta/50 opacity-95"
                    : "border-line opacity-55",
              ].join(" ")}
            >
              <div
                className={[
                  "absolute inset-0 bg-cream-2",
                  "bg-[radial-gradient(130%_85%_at_50%_25%,oklch(94%_0.045_40/0.9),oklch(93%_0.014_72/1)_72%)]",
                  isActive && !hasStill ? "animate-breathe" : "",
                  isWaiting ? "opacity-65" : "",
                ].join(" ")}
                aria-hidden
              />

              {hasStill && (
                <img
                  src={frame.stillUrl!}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover animate-fade-in"
                />
              )}

              <span
                className={[
                  "absolute left-1.5 top-1.5 font-mono text-[10px] tabular-nums tracking-tight",
                  hasStill
                    ? "text-cream/90 [text-shadow:0_1px_2px_oklch(20%_0.02_50/0.45)]"
                    : "text-faint",
                ].join(" ")}
              >
                {String(frame.n).padStart(2, "0")}
              </span>

              {frame.hasClip && (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 inline-flex h-1.5 w-1.5 rounded-full bg-terracotta shadow-[0_0_0_2px_oklch(97%_0.012_75/0.55)]"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1.5">
        <div
          key={`active-${activeLabel}`}
          className="animate-fade-in font-display text-[20px] italic font-normal leading-[1.35] text-ink sm:text-[22px]"
        >
          {activeLabel}
          <span className="text-faint">.</span>
        </div>
        <div
          key={`stage-${stageKey}`}
          className="animate-fade-in text-[13px] leading-[1.55] text-muted"
        >
          {narration}
        </div>
      </div>

      {error ? (
        <div className="mt-7 flex items-center justify-between gap-4">
          <p className="max-w-[46ch] text-[12px] leading-[1.6] text-terracotta">
            Generation stopped before a film was ready. {error}
          </p>
          <button
            type="button"
            onClick={onBack}
            className="rounded-md bg-ink px-4 py-2.5 text-[12px] font-medium text-cream transition hover:bg-terracotta"
          >
            Try again
          </button>
        </div>
      ) : (
        <p className="mt-8 text-[12px] leading-[1.6] text-faint">
          This usually takes a few minutes. Keep this tab open.
        </p>
      )}
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
