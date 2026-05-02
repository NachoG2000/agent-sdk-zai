"use client";

import { useState } from "react";
import type { Submission } from "@/app/page";

const CHAPTERS = [
  { t: "0:00", title: "A healthy knee", caption: "Where we start" },
  { t: "0:04", title: "Your specific tear", caption: "Medial meniscus" },
  { t: "0:09", title: "The arthroscope arrives", caption: "Two small portals" },
  { t: "0:14", title: "The repair", caption: "Trimmed and smoothed" },
  { t: "0:19", title: "Healed", caption: "Quiet, stable" },
  { t: "0:22", title: "Back to walking", caption: "What recovery feels like" },
] as const;

export default function Result({
  submission,
  onRestart,
}: {
  submission: Submission;
  onRestart: () => void;
}) {
  const [playing, setPlaying] = useState(false);

  const procedure = "Arthroscopic medial meniscus repair";
  const region = "Right knee";

  return (
    <div className="w-full max-w-[1100px] animate-fade-up lg:flex lg:h-[calc(100dvh-4rem)] lg:max-h-[920px] lg:flex-col">
      <header className="mb-6 lg:mb-5 lg:shrink-0">
        <div className="mb-2.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="h-3 w-3 text-sage"
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
          <span>Your film is ready</span>
        </div>
        <h2 className="font-display text-[36px] leading-[1.05] font-light text-ink sm:text-[44px] lg:text-[42px]">
          A short film,{" "}
          <em className="italic text-terracotta">made for you</em>.
        </h2>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_auto] lg:gap-12">
        <section className="order-2 flex min-h-0 flex-col lg:order-1">
          <p className="text-[14px] leading-[1.6] text-ink-2 lg:max-w-[44ch]">
            Twenty-four seconds, six chapters. Watch tonight, again tomorrow,
            once more the morning of.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 sm:grid-cols-4">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">
                Procedure
              </dt>
              <dd className="mt-1 font-display text-[14px] font-normal leading-tight text-ink">
                {procedure}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">
                Region
              </dt>
              <dd className="mt-1 font-display text-[14px] font-normal leading-tight text-ink">
                {region}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">
                Length
              </dt>
              <dd className="mt-1 font-mono text-[13px] tabular-nums text-ink">
                0:24
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] uppercase tracking-[0.18em] text-faint">
                Source
              </dt>
              <dd className="mt-1 truncate text-[13px] text-ink">
                {submission.fileName ?? "Your description"}
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex min-h-0 flex-1 flex-col border-t border-line pt-5">
            <h3 className="mb-3 text-[10px] uppercase tracking-[0.18em] text-faint">
              Chapters
            </h3>
            <ol className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
              {CHAPTERS.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="group flex w-full items-baseline gap-4 rounded-sm py-1 text-left transition hover:bg-cream-2/60"
                  >
                    <span className="font-mono text-[11px] tabular-nums text-faint group-hover:text-terracotta">
                      {c.t}
                    </span>
                    <span className="flex flex-1 items-baseline justify-between gap-3">
                      <span className="font-display text-[15px] font-normal text-ink">
                        {c.title}
                      </span>
                      <span className="hidden text-[12px] text-muted sm:inline">
                        {c.caption}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5 lg:shrink-0">
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-md border border-line bg-transparent px-4 py-2.5 text-[12px] text-ink transition hover:border-line-strong hover:bg-cream-2"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <path
                  d="M8 3V11M8 11L4.5 7.5M8 11L11.5 7.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2.5 13H13.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              <span>Download</span>
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-md border border-line bg-transparent px-4 py-2.5 text-[12px] text-ink transition hover:border-line-strong hover:bg-cream-2"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <path
                  d="M11 5L8 2L5 5M8 2V10"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 9V13H13V9"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="ml-auto flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2.5 text-[12px] font-medium text-cream transition hover:bg-terracotta"
            >
              <span>New film</span>
            </button>
          </div>
        </section>

        <aside className="order-1 flex justify-center lg:order-2 lg:h-full lg:items-center">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause film" : "Play film"}
            className="group relative aspect-[9/16] w-full max-w-[420px] overflow-hidden rounded-lg border border-line bg-ink shadow-[0_30px_60px_-20px_rgba(50,30,20,0.35),_0_8px_20px_-8px_rgba(50,30,20,0.25)] lg:h-full lg:w-auto lg:max-w-none"
          >
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background:
                  "radial-gradient(ellipse 70% 50% at 50% 30%, oklch(40% 0.05 40 / 0.9), oklch(20% 0.02 40) 70%)",
              }}
            />
            <div
              className="absolute inset-0 opacity-50 mix-blend-soft-light animate-breathe"
              style={{
                background:
                  "radial-gradient(circle at 50% 60%, oklch(70% 0.14 35 / 0.5), transparent 60%)",
              }}
            />

            <div className="absolute inset-0 flex items-center justify-center">
              {!playing ? (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cream/95 shadow-lg transition group-hover:scale-105">
                  <svg viewBox="0 0 24 24" fill="none" className="ml-1 h-6 w-6">
                    <path
                      d="M8 5L19 12L8 19V5Z"
                      fill="currentColor"
                      className="text-ink"
                    />
                  </svg>
                </span>
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-cream/15 backdrop-blur-sm">
                  <span className="flex gap-1.5">
                    <span className="h-5 w-1 rounded-full bg-cream" />
                    <span className="h-5 w-1 rounded-full bg-cream" />
                  </span>
                </span>
              )}
            </div>

            <div className="absolute left-4 top-4 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-cream/70">
              <span className="inline-block h-1 w-1 rounded-full bg-terracotta" />
              <span>PreOp · Vertical</span>
            </div>

            <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 px-4 py-4">
              <span className="font-mono text-[10px] tabular-nums text-cream/70">
                0:00
              </span>
              <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-cream/15">
                <div
                  className="h-full bg-cream/85 transition-all"
                  style={{
                    width: playing ? "32%" : "0%",
                    transitionDuration: playing ? "8s" : "300ms",
                    transitionTimingFunction: "linear",
                  }}
                />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-cream/70">
                0:24
              </span>
            </div>
          </button>
        </aside>
      </div>
    </div>
  );
}
