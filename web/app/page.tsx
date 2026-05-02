"use client";

import { useState } from "react";
import Upload from "@/components/Upload";
import Processing from "@/components/Processing";
import Result from "@/components/Result";

export type Stage = "upload" | "processing" | "result";

export type Submission = {
  diagnosis: string;
  fileName: string | null;
};

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [submission, setSubmission] = useState<Submission | null>(null);

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
          onDone={() => setStage("result")}
        />
      )}
      {stage === "result" && submission && (
        <Result
          submission={submission}
          onRestart={() => {
            setSubmission(null);
            setStage("upload");
          }}
        />
      )}
    </main>
  );
}
