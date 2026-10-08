export interface ImageResult {
  /** Output file name including extension */
  name: string;
  buffer: Buffer;
  contentType: string;
  ext: string;
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
}

export interface RawImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel */
  data: Uint8ClampedArray;
}
