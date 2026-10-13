/** Content alignment used by the `trim` and `sequence-to-sheet` tools. */
export const ANCHORS = [
  "center",
  "top-left",
  "top",
  "top-right",
  "left",
  "right",
  "bottom-left",
  "bottom",
  "bottom-right",
] as const;

export type Anchor = (typeof ANCHORS)[number];

/** Anchor position as a 0-1 fraction of the box it anchors to. */
export function anchorFraction(anchor: Anchor): { fx: number; fy: number } {
  const fx = anchor.includes("left") ? 0 : anchor.includes("right") ? 1 : 0.5;
  const fy = anchor.includes("top") ? 0 : anchor.includes("bottom") ? 1 : 0.5;
  return { fx, fy };
}

/** Top-left corner of a content box inside a bigger canvas, per anchor. */
export function anchorOffset(
  anchor: Anchor,
  width: number,
  height: number,
  contentWidth: number,
  contentHeight: number
): [number, number] {
  const { fx, fy } = anchorFraction(anchor);
  return [
    Math.round(fx * (width - contentWidth)),
    Math.round(fy * (height - contentHeight)),
  ];
}