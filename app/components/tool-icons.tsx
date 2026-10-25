import type { ReactNode } from "react";

/**
 * All tool icon paths, keyed by `ToolConfig.icon`. Shared by the nav dropdown,
 * mobile menu and the homepage card grid so sizes stay the only difference.
 */
const ICON_PATHS: Record<string, ReactNode> = {
  eye: (
    <>
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </>
  ),
  grid: (
    <>
      <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
      <path d="M4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
      <path d="M16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </>
  ),
  expand: <path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />,
  resize: <path d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />,
  compress: (
    <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  ),
  transform: (
    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  ),
  edit: (
    <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  ),
  crop: <path d="M3 4v16h16M7 20V8m0 0h12" />,
  vectorize: (
    <path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
  ),
  atlas: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M8 8h3v3H8zM13 8h3v2h-3zM8 13h3v3H8zM13 12h3v4h-3z" />
    </>
  ),
  frames: (
    <>
      <path d="M3 5h18v14H3z" />
      <path d="M8 5v14M16 5v14M3 9h5M3 15h5M16 9h5M16 15h5" />
    </>
  ),
  split: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M12 4v16M4 12h16" />
      <path d="M2 2l3 3M22 22l-3-3" />
    </>
  ),
  nine: (
    <>
      <path d="M4 4h16v16H4z" />
      <path d="M9.33 4v16M14.67 4v16M4 9.33h16M4 14.67h16" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3s6 6.4 6 10.5a6 6 0 11-12 0C6 9.4 12 3 12 3z" />
      <path d="M12 17a2 2 0 100-4 2 2 0 000 4z" />
    </>
  ),
  swatch: <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" />,
  lint: (
    <>
      <path d="M9 4h6v3H9z" />
      <path d="M15 5.5h3v14H6v-14h3" />
      <path d="M9.5 13l1.8 1.8L15 11" />
    </>
  ),
  trim: (
    <>
      <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
      <path d="M9 9h6v6H9z" />
    </>
  ),
  bleed: (
    <>
      <path strokeDasharray="3 3" d="M4 4h16v16H4z" />
      <path d="M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </>
  ),
  optimize: (
    <>
      <path d="M12 4v10m0 0l-4-4m4 4l4-4" />
      <path d="M5 18h14" />
    </>
  ),
  film: (
    <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  ),
  sparkles: (
    <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 18L18 6M6 6l12 12" />,
  "chevron-down": <path d="M19 9l-7 7-7-7" />,
};

interface ToolIconProps {
  icon: string;
  className?: string;
  strokeWidth?: number;
}

export function ToolIcon({ icon, className = "h-4 w-4", strokeWidth = 2 }: ToolIconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
    >
      {ICON_PATHS[icon] ?? null}
    </svg>
  );
}
