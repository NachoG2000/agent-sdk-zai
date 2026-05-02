"use client";

import { useState } from "react";
import type { Submission } from "@/app/page";

export default function Result({
  submission,
  onRestart,
}: {
  submission: Submission;
  onRestart: () => void;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col items-center">
      <div className="mb-6 text-center">
        <h2 className="text-lg font-light tracking-tight">Your film is ready</h2>
        <p className="mt-1 text-xs text-neutral-500">
          {submission.fileName
            ? submission.fileName
            : truncate(submission.diagnosis)}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        className="group relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-b from-neutral-900 via-neutral-950 to-black shadow-2xl"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {!playing ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 transition group-hover:scale-105">
              <svg
                viewBox="0 0 24 24"
                fill="black"
                className="ml-1 h-7 w-7"
                aria-hidden
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-neutral-300">
              <div className="h-10 w-10 animate-pulse rounded-full bg-white/20" />
              <span className="text-xs uppercase tracking-widest text-neutral-500">
                Mock playback
              </span>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 px-4 py-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={
                playing
                  ? "h-full w-1/3 bg-white/80 transition-all duration-1000"
                  : "h-full w-0 bg-white/80"
              }
            />
          </div>
          <span className="text-[10px] font-medium tracking-wide text-neutral-400">
            0:24
          </span>
        </div>
      </button>

      <div className="mt-6 flex w-full gap-3">
        <button
          type="button"
          className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-300 transition hover:border-neutral-600"
        >
          Share
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-neutral-200"
        >
          New film
        </button>
      </div>
    </div>
  );
}

function truncate(s: string) {
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
}
