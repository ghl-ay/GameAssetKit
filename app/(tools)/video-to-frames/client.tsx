"use client";

import { useState } from "react";
import { ApiToolPanel } from "../../components/ApiToolPanel";

export function VideoToFramesClient({ description }: { description: string }) {
  const [hasFiles, setHasFiles] = useState(false);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {!hasFiles && (
        <div className="mb-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-2 text-xl font-semibold text-white">视频转序列帧工具</h2>
            <p className="text-zinc-400">{description}</p>
          </div>
        </div>
      )}

      <ApiToolPanel
        toolKey="video-to-frames"
        description="点击或拖拽上传视频文件(mp4/webm/mov/gif 等)"
        onHasFilesChange={setHasFiles}
      />
    </main>
  );
}
