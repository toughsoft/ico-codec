const SectionSize = {
  HEADER: 6,
  DIR_ENTRY: 16,
};

const Offset = {
  // Relative to header
  NUM_IMAGES: 4,

  // Relative to directory entry
  IMAGE_WIDTH: 0,
  IMAGE_HEIGHT: 1,
  IMAGE_SIZE: 8,
  IMAGE_OFFSET: 12,
};

const BMP_HEADER_SIZE = 14;

const PNG_HEADER = Uint8Array.from([
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
]);

const range = (lower: number, upper: number) => {
  const result = [];
  for (let i = lower; i < upper; i++) {
    result.push(i);
  }
  return result;
};

const startsWith = (buf1: Uint8Array, buf2: Uint8Array) => {
  return buf2.every((byte, i) => {
    return byte === buf1[i];
  });
};

const copy = (
  source: Uint8Array,
  target: Uint8Array,
  sourceStart = 0,
  targetStart = 0,
  targetEnd = target.length,
) => {
  const sourceEnd = Math.min(
    sourceStart + (targetEnd - targetStart),
    source.length,
    target.length,
  );

  for (let i = sourceStart; i < sourceEnd; i++) {
    target[targetStart + i] = source[i];
  }
};

export const maybe = (buffer: Uint8Array) => {
  return Boolean(
    // First 16 bits are reserved 0
    buffer[0] === 0 && buffer[1] === 0 &&
      // Second 16 are either 1 for icon, or 2 for cursor
      // Cursor is virtually equivalent to icon in all other aspects
      (buffer[2] === 1 || buffer[2] === 2) && buffer[3] === 0,
  );
};

const numImages = (bytes: Uint8Array) => {
  return new DataView(bytes.buffer).getUint16(Offset.NUM_IMAGES, true);
};

const decodeImage = (bytes: Uint8Array, idx: number) => {
  const view = new DataView(bytes.buffer);
  const entryOffset = SectionSize.HEADER + SectionSize.DIR_ENTRY * idx;
  const width = view.getUint8(entryOffset + Offset.IMAGE_WIDTH);
  const height = view.getUint8(entryOffset + Offset.IMAGE_HEIGHT);
  const size = view.getUint32(entryOffset + Offset.IMAGE_SIZE, true);
  const offset = view.getUint32(entryOffset + Offset.IMAGE_OFFSET, true);
  const icoImg = new Uint8Array(bytes.buffer.slice(offset, offset + size));
  const icoImgView = new DataView(icoImg.buffer);

  // Check if image data PNG
  if (startsWith(icoImg, PNG_HEADER)) {
    return {
      width,
      height,
      size,
      data: icoImg,
      type: "png",
    };
    // Else assume headerless BMP and yield image data with header attached
  } else {
    const dibHeaderSize = icoImgView.getUint32(0, true);
    const bmp = new Uint8Array(size + BMP_HEADER_SIZE + dibHeaderSize);
    const bmpView = new DataView(bmp.buffer);

    // Write missing BMP header data
    // First two bytes are 'BM' in ASCII
    bmpView.setUint8(0, 0x42);
    bmpView.setUint8(1, 0x4D);
    // BMP file size
    bmpView.setUint32(2, size + BMP_HEADER_SIZE + dibHeaderSize, true);
    // Reserved 0s
    bmpView.setUint32(6, 0, true);
    // Offset of actual image data
    bmpView.setUint32(10, BMP_HEADER_SIZE + dibHeaderSize, true);

    // Write image data from ICO to BMP buffer
    copy(icoImg, bmp, 0, BMP_HEADER_SIZE);
    // BMPs in ICO files have their height stored double because why?
    bmpView.setUint32(
      8 + BMP_HEADER_SIZE,
      bmpView.getUint32(8 + BMP_HEADER_SIZE, true) / 2,
      true,
    );

    return { width, height, size, data: bmp, type: "bmp" };
  }
};

export const decode = (bytes: Uint8Array) => {
  return range(0, numImages(bytes)).map((i) => decodeImage(bytes, i));
};
