export function createJpegParser(onFrame: (jpeg: Buffer) => void): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);
  const startMarker = Buffer.from([0xff, 0xd8]);
  const endMarker = Buffer.from([0xff, 0xd9]);

  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const start = buffer.indexOf(startMarker);
      if (start < 0) {
        buffer = Buffer.alloc(0);
        return;
      }
      if (start > 0) buffer = buffer.subarray(start);
      const end = buffer.indexOf(endMarker, 2);
      if (end < 0) {
        if (buffer.length > 8_000_000) buffer = buffer.subarray(buffer.length - 2);
        return;
      }
      const frame = Buffer.from(buffer.subarray(0, end + 2));
      buffer = buffer.subarray(end + 2);
      onFrame(frame);
    }
  };
}
