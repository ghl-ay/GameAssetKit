"use client";

import { useState } from "react";
import { ApiToolPanel } from "../../components/ApiToolPanel";

export function PaletteExtractClient({ description }: { description: string }) {
  const [hasFiles, setHasFiles] = useState(false);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {!hasFiles && (
        <div className="mb-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-2 text-xl font-semibold text-white">
              调色板提取工具
            </h2>
            <p className="text-zinc-400">{description}</p>
          </div>
        </div>
      )}

      <ApiToolPanel
        toolKey="palette-extract"
        description={description}
        onHasFilesChange={setHasFiles}
      />
    </main>
  );
}
