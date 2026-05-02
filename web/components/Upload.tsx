"use client";

import { useState } from "react";
import type { Submission } from "@/app/page";

export default function Upload({
  onSubmit,
}: {
  onSubmit: (s: Submission) => void;
}) {
  const [diagnosis, setDiagnosis] = useState("");

  const canSubmit = diagnosis.trim().length > 0;

  return (
    <div className="w-full max-w-[600px] animate-fade-up">
      <header className="mb-14">
        <div className="mb-6 flex items-center gap-3">
          <img
            src="/icons/preop-app-icon.png"
            alt="PreOp"
            width={44}
            height={44}
            className="h-11 w-11 rounded-[10px]"
          />
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
            Pre-operative film
          </span>
        </div>
        <h1 className="font-display text-[64px] leading-[0.95] font-light tracking-tight text-ink">
          A film of what is
          <br />
          <em className="font-normal italic text-terracotta">about to happen</em>
          <br />
          inside you.
        </h1>
        <p className="mt-6 max-w-[46ch] text-[15px] leading-[1.6] text-ink-2">
          Tell us about your upcoming surgery. In a few minutes, we will
          make you a short film that walks you through your body, the procedure,
          and the healed result.
        </p>
      </header>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          onSubmit({
            diagnosis: diagnosis.trim(),
            runId: crypto.randomUUID(),
          });
        }}
      >
        <label
          className="block text-[11px] uppercase tracking-[0.18em] text-muted"
          htmlFor="diagnosis"
        >
          Describe your case
        </label>
        <textarea
          id="diagnosis"
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          placeholder="A torn meniscus in my right knee. My surgeon said arthroscopic repair, scheduled next Tuesday."
          rows={4}
          className="w-full resize-none rounded-md border border-line bg-cream-2/50 px-5 py-4 font-display text-[19px] leading-[1.5] text-ink placeholder:font-display placeholder:italic placeholder:font-light placeholder:text-faint focus:border-line-strong focus:bg-cream-2 focus:outline-none"
        />

        <button
          type="submit"
          disabled={!canSubmit}
          className="group mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-ink px-5 py-4 text-[14px] font-medium text-cream transition hover:bg-terracotta disabled:cursor-not-allowed disabled:bg-cream-3 disabled:text-faint"
        >
          <span>Make my film</span>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            className="h-3.5 w-3.5 transition group-enabled:group-hover:translate-x-0.5"
            aria-hidden
          >
            <path
              d="M3 8H13M13 8L9 4M13 8L9 12"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>

      <p className="mt-10 text-[12px] leading-[1.6] text-faint">
        Made for one patient at a time. Your input never leaves the session;
        nothing is stored against your name.
      </p>
    </div>
  );
}
