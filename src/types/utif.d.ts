declare module 'utif' {
  export interface UTIFImage {
    width: number;
    height: number;
    [key: string]: unknown;
  }

  const UTIF: {
    decode(buffer: ArrayBuffer | Uint8Array): UTIFImage[];
    decodeImage(buffer: ArrayBuffer | Uint8Array, image: UTIFImage, images?: UTIFImage[]): void;
    toRGBA8(image: UTIFImage): Uint8Array;
    encodeImage(
      rgba: Uint8Array,
      width: number,
      height: number,
      metadata?: Record<string, unknown>,
    ): ArrayBuffer;
    encode(images: UTIFImage[], metadata?: Record<string, unknown>): ArrayBuffer;
  };

  export default UTIF;
}
