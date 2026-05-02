"use client";

import { useEffect, useRef, useState } from "react";
import type { Submission } from "@/app/page";

type Step = {
  stage: number;
  kind: "stage" | "thought";
  text: string;
  delay: number;
};

const STAGES = [
  "Reading your diagnosis",
  "Sketching the storyboard",
  "Painting the anatomy",
  "Filming the procedure",
] as const;

const SCRIPT: Step[] = [
  { stage: 0, kind: "stage", text: STAGES[0], delay: 0 },
  { stage: 0, kind: "thought", text: "Identifying the procedure family", delay: 700 },
  { stage: 0, kind: "thought", text: "Mapping to arthroscopic meniscus repair", delay: 900 },
  { stage: 0, kind: "thought", text: "Pulling anatomical context for the medial meniscus", delay: 1100 },

  { stage: 1, kind: "stage", text: STAGES[1], delay: 1200 },
  { stage: 1, kind: "thought", text: "Establishing the six-frame narrative arc", delay: 700 },
  { stage: 1, kind: "thought", text: "Frame 1 · healthy baseline anatomy", delay: 800 },
  { stage: 1, kind: "thought", text: "Frame 3 · the lateral approach, instruments entering", delay: 900 },
  { stage: 1, kind: "thought", text: "Frame 5 · the repair, healed and quiet", delay: 900 },

  { stage: 2, kind: "stage", text: STAGES[2], delay: 1100 },
  { stage: 2, kind: "thought", text: "Locking the style reference from frame 1", delay: 900 },
  { stage: 2, kind: "thought", text: "Painting frame 2 · the tear pattern", delay: 1000 },
  { stage: 2, kind: "thought", text: "Painting frame 3 · arthroscope sleeve, slow approach", delay: 1100 },
  { stage: 2, kind: "thought", text: "Painting frame 5 · the smoothed edge, post-trim", delay: 1100 },
  { stage: 2, kind: "thought", text: "Holding palette continuity across all six frames", delay: 1000 },

  { stage: 3, kind: "stage", text: STAGES[3], delay: 1200 },
  { stage: 3, kind: "thought", text: "Animating frame one into frame two", delay: 900 },
  { stage: 3, kind: "thought", text: "Layering the voiceover narration", delay: 900 },
  { stage: 3, kind: "thought", text: "Color-grading toward warm anatomical neutrals", delay: 1000 },
  { stage: 3, kind: "thought", text: "Mastering the vertical export", delay: 900 },
];

export default function Processing({
  submission,
  onDone,
}: {
  submission: Submission;
  onDone: () => void;
}) {
  const [revealed, setRevealed] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(performance.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let i = 0;

    const advance = () => {
      if (cancelled) return;
      if (i >= SCRIPT.length) {
        const tail = setTimeout(() => !cancelled && onDone(), 900);
        return () => clearTimeout(tail);
      }
      const step = SCRIPT[i];
      setTimeout(() => {
        if (cancelled) return;
        i += 1;
        setRevealed(i);
        advance();
      }, step.delay);
    };

    advance();
    return () => {
      cancelled = true;
    };
  }, [onDone]);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed((performance.now() - startRef.current) / 1000);
    }, 80);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [revealed]);

  const visible = SCRIPT.slice(0, revealed);
  const lastIdx = visible.length - 1;
  const currentStage = visible[lastIdx]?.stage ?? 0;

  const stageStartTimes = computeStageStarts(visible);

  return (
    <div className="w-full max-w-[640px] animate-fade-up">
      <header className="mb-10">
        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 rounded-full bg-terracotta animate-pulse-dot" />
          </span>
          <span>Generating your film</span>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
            {formatTime(elapsed)}
          </span>
        </div>
        <h2 className="font-display text-[36px] leading-[1.05] font-light text-ink">
          Making a film just for{" "}
          <em className="italic text-terracotta">you</em>.
        </h2>
        <p className="mt-3 max-w-[52ch] text-[14px] leading-[1.6] text-ink-2">
          {submission.fileName
            ? `Reading ${submission.fileName} and translating it into something you can watch.`
            : "Translating your words into anatomy, then anatomy into a short film."}
        </p>
      </header>

      <div
        ref={scrollRef}
        className="relative max-h-[420px] overflow-hidden rounded-md border border-line bg-cream-2/40 px-6 py-5"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-cream-2 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-cream-2 to-transparent" />

        <ol className="space-y-1">
          {visible.map((step, idx) => {
            const isLast = idx === lastIdx;
            const stageDone = step.stage < currentStage;
            const stageT = stageStartTimes[step.stage] ?? 0;

            if (step.kind === "stage") {
              return (
                <li
                  key={idx}
                  className="animate-fade-up flex items-baseline gap-3 pt-4 first:pt-0"
                  style={{ animationDelay: "0ms" }}
                >
                  <span className="font-mono text-[10px] tabular-nums text-faint">
                    {formatTime(stageT)}
                  </span>
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center self-center">
                    {stageDone ? (
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        className="h-3.5 w-3.5 text-sage"
                        aria-hidden
                      >
                        <path
                          d="M3.5 8.5L6.5 11.5L12.5 5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span className="relative inline-flex h-1.5 w-1.5">
                        <span className="absolute inset-0 rounded-full bg-terracotta animate-pulse-dot" />
                      </span>
                    )}
                  </span>
                  <span
                    className={
                      stageDone
                        ? "font-display text-[17px] font-normal text-ink"
                        : isLast
                          ? "shimmer-text font-display text-[17px] font-normal"
                          : "font-display text-[17px] font-normal text-ink"
                    }
                  >
                    {step.text}
                  </span>
                </li>
              );
            }

            const thoughtT = stageT + idx * 0.05;
            return (
              <li
                key={idx}
                className="animate-fade-up flex items-baseline gap-3 pl-7"
              >
                <span className="font-mono text-[10px] tabular-nums text-faint">
                  {formatTime(thoughtT)}
                </span>
                <span
                  className={
                    isLast
                      ? "shimmer-text text-[14px] leading-[1.55]"
                      : "text-[14px] leading-[1.55] text-muted"
                  }
                >
                  {step.text}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="mt-6 text-[12px] leading-[1.6] text-faint">
        Films take about thirty seconds to render. You can keep this tab open or
        come back; nothing is lost.
      </p>
    </div>
  );
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function computeStageStarts(visible: Step[]) {
  const starts: Record<number, number> = {};
  let acc = 0;
  for (const step of visible) {
    if (step.kind === "stage" && starts[step.stage] === undefined) {
      starts[step.stage] = acc;
    }
    acc += step.delay / 1000;
  }
  return starts;
}
