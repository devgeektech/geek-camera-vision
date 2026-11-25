import sharp from "sharp";

export type Letterbox = {
  data: Float32Array;
  padX: number;
  padY: number;
  scale: number;
  frameWidth: number;
  frameHeight: number;
};

export async function letterboxJpeg(jpeg: Buffer, size = 640): Promise<Letterbox> {
  const image = sharp(jpeg).rotate();
  const meta = await image.metadata();
  const frameWidth = meta.width ?? size;
  const frameHeight = meta.height ?? size;
  const scale = Math.min(size / frameWidth, size / frameHeight);
  const resizedWidth = Math.max(1, Math.round(frameWidth * scale));
  const resizedHeight = Math.max(1, Math.round(frameHeight * scale));
  const padX = Math.floor((size - resizedWidth) / 2);
  const padY = Math.floor((size - resizedHeight) / 2);
  const { data, info } = await image
    .resize(resizedWidth, resizedHeight, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const canvas = Buffer.alloc(size * size * 3, 114);
  for (let y = 0; y < info.height; y++) {
    const sourceStart = y * info.width * 3;
    const targetStart = ((y + padY) * size + padX) * 3;
    data.copy(canvas, targetStart, sourceStart, sourceStart + info.width * 3);
  }

  const tensor = new Float32Array(3 * size * size);
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    tensor[i] = canvas[i * 3]! / 255;
    tensor[plane + i] = canvas[i * 3 + 1]! / 255;
    tensor[plane * 2 + i] = canvas[i * 3 + 2]! / 255;
  }

  return { data: tensor, padX, padY, scale, frameWidth, frameHeight };
}
