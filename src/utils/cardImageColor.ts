function averageColorFromImageData(data: Uint8ClampedArray): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;

    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }

  if (count === 0) return null;

  r = Math.floor(r / count);
  g = Math.floor(g / count);
  b = Math.floor(b / count);

  return `rgba(${r}, ${g}, ${b}, 0.55)`;
}

function sampleImageSource(
  source: CanvasImageSource,
  width: number,
  height: number
): string | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx || width <= 0 || height <= 0) {
    return null;
  }

  const sampleWidth = 64;
  const sampleHeight = Math.max(1, Math.round((height / width) * sampleWidth));

  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  ctx.drawImage(source, 0, 0, sampleWidth, sampleHeight);

  return averageColorFromImageData(
    ctx.getImageData(0, 0, sampleWidth, sampleHeight).data
  );
}

export function getDominantColorFromImage(img: HTMLImageElement): string | null {
  try {
    return sampleImageSource(img, img.naturalWidth, img.naturalHeight);
  } catch {
    return null;
  }
}

export async function getDominantColorFromImageUrl(
  imageUrl: string,
  apiUrl: string
): Promise<string | null> {
  try {
    const proxyUrl = `${apiUrl}/api/image/proxy?url=${encodeURIComponent(imageUrl)}`;
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    try {
      return sampleImageSource(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}