// Finds the black-and-white images of a book and marks them `data-bw` (the others `data-colour`), so
// "invert black-and-white images only" has something to select. Decoding every image is not free, so each is
// looked at once as it loads.

/** Whether each image (by blob URL) is greyscale. A book's URLs survive recompiles (append/reorder), so its images are checked once. */
const greyByUrl = new Map<string, boolean>();

const urlOf = (img: HTMLImageElement): string => img.currentSrc || img.src;

/** Mark an image `data-bw` if (nearly) all its pixels are grey. */
function tag(img: HTMLImageElement): void {
  if (img.dataset.bw !== undefined || img.dataset.colour !== undefined) return;
  const SIZE = 48;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  try {
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
    let coloured = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3]! < 16) continue;
      if (Math.max(px[i]!, px[i + 1]!, px[i + 2]!) - Math.min(px[i]!, px[i + 1]!, px[i + 2]!) > 24) coloured++;
    }
    const grey = coloured / (SIZE * SIZE) < 0.02;
    img.dataset[grey ? "bw" : "colour"] = "";
    greyByUrl.set(urlOf(img), grey);
  } catch {
    // Tainted or undecodable image: leave it alone.
  }
}

/** Tag the images under `root`, those still loading when they have. Returns the cleanup. */
export function tagGreyImages(root: HTMLElement): () => void {
  const imgs = root.querySelectorAll("img");
  const onLoad = (e: Event): void => tag(e.currentTarget as HTMLImageElement);
  for (const img of imgs) {
    const known = greyByUrl.get(urlOf(img));
    if (known !== undefined) img.dataset[known ? "bw" : "colour"] = "";
    else if (img.complete && img.naturalWidth) tag(img);
    else img.addEventListener("load", onLoad, { once: true });
  }
  return () => imgs.forEach((img) => img.removeEventListener("load", onLoad));
}
