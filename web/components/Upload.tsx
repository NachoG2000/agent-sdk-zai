"use client";

import { useRef, useState } from "react";
import type { Submission } from "@/app/page";

export default function Upload({
  onSubmit,
}: {
  onSubmit: (s: Submission) => void;
}) {
  const [diagnosis, setDiagnosis] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canSubmit = diagnosis.trim().length > 0 || fileName !== null;

  return (
    <div className="w-full max-w-xl">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-light tracking-tight">PreOp</h1>
        <p className="mt-3 text-sm text-neutral-400">
          A short film of what is about to happen inside you.
        </p>
      </header>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          onSubmit({ diagnosis: diagnosis.trim(), fileName });
        }}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-neutral-700 bg-neutral-950 px-5 py-6 text-left transition hover:border-neutral-500 hover:bg-neutral-900"
        >
          <div>
            <div className="text-sm font-medium">
              {fileName ?? "Upload your medical report (PDF)"}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {fileName ? "Tap to replace" : "Optional. We accept PDF."}
            </div>
          </div>
          <span className="text-neutral-500">→</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFileName(f.name);
          }}
        />

        <div className="relative">
          <textarea
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="Or describe your diagnosis in your own words. Example: torn meniscus, surgery scheduled next Tuesday."
            rows={4}
            className="w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-5 py-4 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl bg-white px-5 py-4 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
        >
          Generate my video
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-neutral-600">
        Your video is generated for you and only you.
      </p>
    </div>
  );
}
