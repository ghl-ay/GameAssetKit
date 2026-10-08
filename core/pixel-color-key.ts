import type { RawImage } from "./types";

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export function colorDistance(c1: RGBColor, c2: RGBColor): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

type ChromaKeyChannel = "red" | "green" | "blue";

/**
 * Detect the dominant channel of a background color for chroma-key
 * refinement. Returns null when no channel is dominant enough.
 * Ported from app/lib/background-remover.ts
 */
export function detectChromaKeyChannel(bgColor: RGBColor): ChromaKeyChannel | null {
  const channels: Array<{ key: ChromaKeyChannel; value: number }> = [
    { key: "red", value: bgColor.r },
    { key: "green", value: bgColor.g },
    { key: "blue", value: bgColor.b },
  ];
  channels.sort((a, b) => b.value - a.value);

  const dominant = channels[0];
  const runnerUp = channels[1];
  if (!dominant || !runnerUp) return null;

  const dominance = dominant.value - runnerUp.value;
  if (dominant.value < 64 || dominance < 24) {
    return null;
  }

  return dominant.key;
}

function getChannelDominance(color: RGBColor, channel: ChromaKeyChannel): number {
  switch (channel) {
    case "red":
      return color.r - Math.max(color.g, color.b);
    case "green":
      return color.g - Math.max(color.r, color.b);
    case "blue":
      return color.b - Math.max(color.r, color.g);
  }
}

export function getChromaKeyAlpha({
  pixel,
  bgColor,
  toleranceDistance,
  originalAlpha,
}: {
  pixel: RGBColor;
  bgColor: RGBColor;
  toleranceDistance: number;
  originalAlpha: number;
}): number {
  const channel = detectChromaKeyChannel(bgColor);
  if (!channel || originalAlpha <= 0) {
    return originalAlpha;
  }

  const backgroundDominance = getChannelDominance(bgColor, channel);
  if (backgroundDominance < 24) {
    return originalAlpha;
  }

  const pixelDominance = Math.max(0, getChannelDominance(pixel, channel));
  const distanceLimit = Math.max(toleranceDistance * 1.35, 48);
  const colorMatch = clamp01(1 - colorDistance(pixel, bgColor) / distanceLimit);
  const dominanceMatch = clamp01(pixelDominance / backgroundDominance);
  const removalSignal = colorMatch * dominanceMatch;

  if (removalSignal <= 0.12) {
    return originalAlpha;
  }

  const alphaFactor = 1 - smoothstep(0.12, 0.88, removalSignal);
  return Math.max(0, Math.min(255, Math.round(originalAlpha * alphaFactor)));
}

function distanceToMask(
  mask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): Float32Array {
  const distance = new Float32Array(width * height);
  distance.fill(Infinity);

  for (let i = 0; i < distance.length; i++) {
    if (mask[i]) distance[i] = 0;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
      if (y > 0) distance[i] = Math.min(distance[i], distance[i - width] + 1);
      if (x > 0 && y > 0)
        distance[i] = Math.min(distance[i], distance[i - width - 1] + 1.414);
      if (x < width - 1 && y > 0)
        distance[i] = Math.min(distance[i], distance[i - width + 1] + 1.414);
    }
  }

  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x < width - 1)
        distance[i] = Math.min(distance[i], distance[i + 1] + 1);
      if (y < height - 1)
        distance[i] = Math.min(distance[i], distance[i + width] + 1);
      if (x < width - 1 && y < height - 1)
        distance[i] = Math.min(distance[i], distance[i + width + 1] + 1.414);
      if (x > 0 && y < height - 1)
        distance[i] = Math.min(distance[i], distance[i + width - 1] + 1.414);
    }
  }

  return distance;
}

/**
 * Smooth the boundary between flood-fill-removed region and foreground
 * using distance transform + color distance for soft alpha transition.
 */
function applyBoundarySoftening(
  data: Uint8ClampedArray,
  visited: Uint8Array,
  width: number,
  height: number,
  bgColor: RGBColor,
  toleranceDistance: number
): void {
  const len = width * height;
  const band = 2.5;
  const outerTolerance = toleranceDistance * 1.5;
  const distToRemoved = distanceToMask(visited, width, height);

  for (let i = 0; i < len; i++) {
    if (visited[i]) continue;
    if (distToRemoved[i] > band) continue;

    const pixelIdx = i * 4;
    const dist = colorDistance(
      { r: data[pixelIdx], g: data[pixelIdx + 1], b: data[pixelIdx + 2] },
      bgColor
    );

    if (dist >= outerTolerance) continue;

    const spatialT = distToRemoved[i] / band;
    const colorT = dist / outerTolerance;
    const t = Math.max(spatialT, colorT);
    const smooth = t * t * (3 - 2 * t);

    data[pixelIdx + 3] = Math.round(data[pixelIdx + 3] * smooth);
  }
}

/**
 * Separable Gaussian blur applied only to the alpha channel.
 */
function gaussianBlurAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number
): void {
  if (sigma <= 0) return;

  const radius = Math.ceil(sigma * 2.5);
  const kernelSize = radius * 2 + 1;
  const kernel = new Float32Array(kernelSize);

  let sum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }

  const len = width * height;
  const alpha = new Float32Array(len);
  const temp = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(Math.max(x + k, 0), width - 1);
        val += alpha[y * width + sx] * kernel[k + radius];
      }
      temp[y * width + x] = val;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(Math.max(y + k, 0), height - 1);
        val += temp[sy * width + x] * kernel[k + radius];
      }
      data[(y * width + x) * 4 + 3] = Math.round(
        Math.max(0, Math.min(255, val))
      );
    }
  }
}

function suppressChromaSpill(
  data: Uint8ClampedArray,
  pixelIdx: number,
  channel: ChromaKeyChannel,
  strength: number
): void {
  const safeStrength = clamp01(strength);
  if (safeStrength <= 0) return;

  const channelIndex = channel === "red" ? 0 : channel === "green" ? 1 : 2;
  const otherIndices = [0, 1, 2].filter((idx) => idx !== channelIndex);
  const channelValue = data[pixelIdx + channelIndex];
  const maxOther = Math.max(
    data[pixelIdx + otherIndices[0]],
    data[pixelIdx + otherIndices[1]]
  );
  const spill = Math.max(0, channelValue - maxOther);

  if (spill === 0) return;

  data[pixelIdx + channelIndex] = Math.max(
    0,
    Math.round(channelValue - spill * safeStrength * 0.6)
  );
}

export function applyChromaKeyRefinement(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bgColor: RGBColor,
  toleranceDistance: number,
  removedMask: Uint8Array
): void {
  const channel = detectChromaKeyChannel(bgColor);
  if (!channel) return;

  const edgeBand = 2.5;
  const distToRemoved = distanceToMask(removedMask, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      if (distToRemoved[pixelIndex] > edgeBand) continue;

      const pixelIdx = (y * width + x) * 4;
      const originalAlpha = data[pixelIdx + 3];
      if (originalAlpha === 0) continue;

      const pixel = {
        r: data[pixelIdx],
        g: data[pixelIdx + 1],
        b: data[pixelIdx + 2],
      };
      const nextAlpha = getChromaKeyAlpha({
        pixel,
        bgColor,
        toleranceDistance,
        originalAlpha,
      });

      if (nextAlpha >= originalAlpha) continue;

      suppressChromaSpill(data, pixelIdx, channel, 1 - nextAlpha / originalAlpha);
      data[pixelIdx + 3] = nextAlpha;
    }
  }
}

/**
 * Erode the alpha mask inward by `radius` pixels using distance transform.
 */
export function applyEdgeShrink(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): void {
  const len = width * height;
  const distToTransparent = new Float32Array(len);
  distToTransparent.fill(Infinity);

  for (let i = 0; i < len; i++) {
    if (data[i * 4 + 3] === 0) {
      distToTransparent[i] = 0;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (distToTransparent[i] === 0) continue;
      if (x > 0)
        distToTransparent[i] = Math.min(
          distToTransparent[i],
          distToTransparent[i - 1] + 1
        );
      if (y > 0)
        distToTransparent[i] = Math.min(
          distToTransparent[i],
          distToTransparent[(y - 1) * width + x] + 1
        );
      if (x > 0 && y > 0)
        distToTransparent[i] = Math.min(
          distToTransparent[i],
          distToTransparent[(y - 1) * width + x - 1] + 1.414
        );
      if (x < width - 1 && y > 0)
        distToTransparent[i] = Math.min(
          distToTransparent[i],
          distToTransparent[(y - 1) * width + x + 1] + 1.414
        );
    }
  }

  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (distToTransparent[i] === 0) continue;
      if (x < width - 1)
        distToTransparent[i] = Math.min(
          distToTransparent[i],
          distToTransparent[i + 1] + 1
        );
      if (y < height - 1)
        distToTransparent[i] = Math.min(
          distToTransparent[i],
          distToTransparent[(y + 1) * width + x] + 1
        );
      if (x < width - 1 && y < height - 1)
        distToTransparent[i] = Math.min(
          distToTransparent[i],
          distToTransparent[(y + 1) * width + x + 1] + 1.414
        );
      if (x > 0 && y < height - 1)
        distToTransparent[i] = Math.min(
          distToTransparent[i],
          distToTransparent[(y + 1) * width + x - 1] + 1.414
        );
    }
  }

  const softZone = Math.min(1, radius * 0.5);
  for (let i = 0; i < len; i++) {
    const d = distToTransparent[i];
    if (d >= radius) continue;
    if (d <= radius - softZone) {
      data[i * 4 + 3] = 0;
    } else {
      const t = (d - (radius - softZone)) / softZone;
      const smooth = t * t * (3 - 2 * t);
      data[i * 4 + 3] = Math.round(data[i * 4 + 3] * smooth);
    }
  }
}

/**
 * Apply feather effect to smooth edges between transparent and opaque areas.
 */
export function applyFeather(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): void {
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  const distance = new Float32Array(width * height);
  distance.fill(Infinity);

  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] === 0) {
      distance[i] = 0;
    }
  }

  const passes = Math.ceil(radius * 1.5);
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (distance[idx] === 0) continue;

        let minDist = distance[idx];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const neighborDist = distance[ny * width + nx];
              const stepDist = dx !== 0 && dy !== 0 ? 1.414 : 1;
              minDist = Math.min(minDist, neighborDist + stepDist);
            }
          }
        }
        distance[idx] = minDist;
      }
    }
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const idx = y * width + x;
        if (distance[idx] === 0) continue;

        let minDist = distance[idx];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const neighborDist = distance[ny * width + nx];
              const stepDist = dx !== 0 && dy !== 0 ? 1.414 : 1;
              minDist = Math.min(minDist, neighborDist + stepDist);
            }
          }
        }
        distance[idx] = minDist;
      }
    }
  }

  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] > 0 && distance[i] < radius) {
      const t = distance[i] / radius;
      const falloff = (1 - Math.cos(t * Math.PI)) / 2;
      data[i * 4 + 3] = Math.round(alpha[i] * falloff);
    }
  }
}

function floodFillRemove(
  data: Uint8ClampedArray,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  bgColor: RGBColor,
  toleranceDistance: number
): void {
  const stack: [number, number][] = [[startX, startY]];
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;

    if (x < 0 || x >= width || y < 0 || y >= height) {
      continue;
    }

    const idx = y * width + x;
    if (visited[idx]) {
      continue;
    }

    const pixelIdx = idx * 4;
    const pixelColor = {
      r: data[pixelIdx],
      g: data[pixelIdx + 1],
      b: data[pixelIdx + 2],
    };

    if (colorDistance(pixelColor, bgColor) > toleranceDistance) {
      continue;
    }

    visited[idx] = 1;
    data[pixelIdx + 3] = 0;

    for (const [dx, dy] of directions) {
      stack.push([x + dx, y + dy]);
    }
  }
}

export interface ColorKeyOptions {
  /** 0-100, percentage of the max RGB distance (441.67) */
  tolerance: number;
  /** Remove only pixels connected to the image border / seed points */
  contiguousOnly?: boolean;
  /** Background color; defaults to the top-left pixel */
  targetColor?: RGBColor;
  /** 0-20 pixels */
  feather?: number;
  antiAlias?: boolean;
  chromaKey?: boolean;
  seedPoints?: { x: number; y: number }[];
  /** 0-20 pixels */
  edgeShrink?: number;
}

/**
 * Pure-pixel port of removeBackground() from app/lib/background-remover.ts.
 * Mutates img.data in place.
 */
export function removeColorBackground(
  img: RawImage,
  options: ColorKeyOptions
): void {
  const {
    tolerance,
    contiguousOnly = false,
    targetColor,
    feather = 0,
    antiAlias = true,
    chromaKey = true,
    seedPoints,
    edgeShrink = 0,
  } = options;

  const { width, height, data } = img;

  const topLeftColor = {
    r: data[0],
    g: data[1],
    b: data[2],
  };
  const bgColor = targetColor ?? topLeftColor;

  const maxDistance = 441.67;
  const toleranceDistance = (tolerance / 100) * maxDistance;

  const visited = new Uint8Array(width * height);

  if (contiguousOnly) {
    for (let x = 0; x < width; x++) {
      floodFillRemove(data, visited, width, height, x, 0, bgColor, toleranceDistance);
      floodFillRemove(
        data, visited, width, height, x, height - 1, bgColor, toleranceDistance
      );
    }
    for (let y = 1; y < height - 1; y++) {
      floodFillRemove(data, visited, width, height, 0, y, bgColor, toleranceDistance);
      floodFillRemove(
        data, visited, width, height, width - 1, y, bgColor, toleranceDistance
      );
    }
  } else {
    if (antiAlias) {
      const innerT = toleranceDistance * 0.85;
      const outerT = toleranceDistance * 1.15;
      for (let i = 0; i < data.length; i += 4) {
        const dist = colorDistance(
          { r: data[i], g: data[i + 1], b: data[i + 2] },
          bgColor
        );
        if (dist <= innerT) {
          data[i + 3] = 0;
          visited[i / 4] = 1;
        } else if (dist < outerT) {
          const t = (dist - innerT) / (outerT - innerT);
          const smooth = t * t * (3 - 2 * t);
          data[i + 3] = Math.round(data[i + 3] * smooth);
        }
      }
    } else {
      for (let i = 0; i < data.length; i += 4) {
        if (
          colorDistance(
            { r: data[i], g: data[i + 1], b: data[i + 2] },
            bgColor
          ) <= toleranceDistance
        ) {
          data[i + 3] = 0;
          visited[i / 4] = 1;
        }
      }
    }
  }

  if (seedPoints && seedPoints.length > 0) {
    for (const pt of seedPoints) {
      if (pt.x < 0 || pt.x >= width || pt.y < 0 || pt.y >= height) continue;
      const seedIdx = (pt.y * width + pt.x) * 4;
      const seedColor = {
        r: data[seedIdx],
        g: data[seedIdx + 1],
        b: data[seedIdx + 2],
      };
      floodFillRemove(
        data, visited, width, height, pt.x, pt.y, seedColor, toleranceDistance
      );
    }
  }

  if (antiAlias) {
    applyBoundarySoftening(
      data, visited, width, height, bgColor, toleranceDistance
    );
    gaussianBlurAlpha(data, width, height, 0.8);
  }

  if (chromaKey) {
    applyChromaKeyRefinement(
      data,
      width,
      height,
      bgColor,
      toleranceDistance,
      visited
    );
  }

  if (edgeShrink > 0) {
    applyEdgeShrink(data, width, height, edgeShrink);
  }

  if (feather > 0) {
    applyFeather(data, width, height, feather);
  }
}
