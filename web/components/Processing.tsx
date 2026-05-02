"use client";

import { useEffect, useState } from "react";
import type { Submission } from "@/app/page";

const STAGES = [
  { label: "Reading your diagnosis", ms: 1500 },
  { label: "Sketching the storyboard", ms: 2000 },
  { label: "Painting the anatomy", ms: 2500 },
  { label: "Filming the procedure", ms: 2000 },
] as const;

export default function Processing({
  submission,
  onDone,
}: {
  submission: Submission;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let i = 0;

    const next = () => {
      if (cancelled) return;
      if (i >= STAGES.length) {
        onDone();
        return;
      }
      setCurrent(i);
      const t = setTimeout(() => {
        i += 1;
        next();
      }, STAGES[i].ms);
      return () => clearTimeout(t);
    };

    next();

    return () => {
      cancelled = true;
    };
  }, [onDone]);

  return (
    <div className="w-full max-w-md">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-2 border-neutral-800 border-t-white" />
        <h2 className="text-lg font-light tracking-tight text-neutral-200">
          Making your film
        </h2>
        <p className="mt-2 text-xs text-neutral-500">
          {submission.fileName
            ? `From ${submission.fileName}`
            : truncate(submission.diagnosis)}
        </p>
      </div>

      <ol className="space-y-3">
        {STAGES.map((s, idx) => {
          const state =
            idx < current ? "done" : idx === current ? "active" : "pending";
          return (
            <li
              key={s.label}
              className="flex items-center gap-3 rounded-lg border border-neutral-900 bg-neutral-950 px-4 py-3"
            >
              <span
                className={
                  state === "done"
                    ? "text-emerald-400"
                    : state === "active"
                      ? "text-white"
                      : "text-neutral-700"
                }
              >
                {state === "done" ? "✓" : state === "active" ? "•" : "○"}
              </span>
              <span
                className={
                  state === "pending"
                    ? "text-sm text-neutral-600"
                    : "text-sm text-neutral-200"
                }
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function truncate(s: string) {
  return s.length > 80 ? s.slice(0, 77) + "..." : s;
}
