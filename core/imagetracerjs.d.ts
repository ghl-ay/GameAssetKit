declare module "imagetracerjs" {
  const ImageTracer: {
    optionpresets: Record<string, Record<string, unknown>>;
    imagedataToSVG(
      imageData: { width: number; height: number; data: Uint8ClampedArray | number[] },
      options?: string | Record<string, unknown>
    ): string;
  };
  export default ImageTracer;
}
