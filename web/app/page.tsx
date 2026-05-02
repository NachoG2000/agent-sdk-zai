"use client";

import { useState } from "react";
import Upload from "@/components/Upload";
import Processing from "@/components/Processing";
import Result from "@/components/Result";
import type { PreopRunResult } from "@/lib/preop";

export type Stage = "upload" | "processing" | "result";

export type Submission = {
  diagnosis: string;
  runId: string;
};

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [result, setResult] = useState<PreopRunResult | null>(null);

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-8 sm:py-10 lg:py-8 [&>*]:my-auto">
      {stage === "upload" && (
        <Upload
          onSubmit={(s) => {
            setSubmission(s);
            setStage("processing");
          }}
        />
      )}
      {stage === "processing" && submission && (
        <Processing
          submission={submission}
          onDone={(r) => {
            setResult(r);
            setStage("result");
          }}
          onBack={() => {
            setSubmission(null);
            setResult(null);
            setStage("upload");
          }}
        />
      )}
      {stage === "result" && submission && result && (
        <Result
          submission={submission}
          result={result}
          onRestart={() => {
            setSubmission(null);
            setResult(null);
            setStage("upload");
          }}
        />
      )}
    </main>
  );
}
