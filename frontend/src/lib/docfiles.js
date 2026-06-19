// Turn user-uploaded files (images OR PDFs) into image data URLs that the
// vision pipeline can consume. PDFs are rendered page-by-page to JPEG on the
// client with pdf.js, so the backend never needs to parse PDFs — it always
// receives images. pdf.js is loaded lazily (dynamic import) so the worker only
// ships when someone actually uploads a PDF.

let _pdfjs = null;

async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import("pdfjs-dist");
  // Vite resolves this to a hashed URL for the worker bundle.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  _pdfjs = pdfjs;
  return pdfjs;
}

export function isSupportedDoc(file) {
  return !!file && (file.type.startsWith("image/") || file.type === "application/pdf");
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

async function pdfToImages(file, maxPages) {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const out = [];
  const n = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 }); // 2x for legible text
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return out;
}

// Convert a FileList/array of images and/or PDFs into image data URLs, capped
// at `max` total. Unsupported files are skipped. Throws if a PDF fails to render.
export async function filesToImages(files, max = 4) {
  const list = Array.from(files || []);
  const out = [];
  for (const file of list) {
    if (out.length >= max) break;
    if (file.type === "application/pdf") {
      out.push(...(await pdfToImages(file, max - out.length)));
    } else if (file.type.startsWith("image/")) {
      out.push(await readImage(file));
    }
    // anything else: silently skip
  }
  return out.slice(0, max);
}
