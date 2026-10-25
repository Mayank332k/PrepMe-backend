const pdf = require("pdf-parse");
const { transcribeResumeImages } = require("./aiService");

// A real resume always has more selectable text than this. Anything below is
// treated as a scanned / image-only PDF and routed to the vision fallback.
const MIN_TOTAL_VISIBLE_CHARS = 100;
const MIN_VISIBLE_CHARS_PER_PAGE = 50;

// Vision calls are expensive, so we only ever send the first few pages.
const MAX_VISION_PAGES = Number(process.env.PDF_VISION_MAX_PAGES) || 3;
const MAX_TOTAL_IMAGE_BYTES = 6 * 1024 * 1024;
// ~108 DPI. Enough for 10-12pt resume text while keeping the payload (and the
// model's image-token count, which drives latency) low.
const RENDER_SCALE = 1.5;

// Returned by the model when a rendered page genuinely has nothing readable.
const EMPTY_PAGE_SENTINEL = "EMPTY_PAGE";

class PdfExtractionError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "PdfExtractionError";
    this.code = code;
    this.cause = cause;
  }
}

const isEncryptionError = (error) =>
  /password|encrypt/i.test(`${error?.name || ""} ${error?.message || ""}`);

const normalizeText = (text) =>
  (text || "")
    .replace(/\u0000/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const countVisibleChars = (text) => text.replace(/\s/g, "").length;

// The document parser returns light HTML/markdown markup (<br>, <sup>, ...).
// Strip it so the downstream JSON extractor sees plain text.
const cleanVisionMarkup = (text) =>
  (text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');

/**
 * Detects whether the PDF's text layer is actually usable, or just noise
 * (page numbers, headers) from a scanned document.
 */
function hasUsableTextLayer(text, numPages) {
  const visibleChars = countVisibleChars(text);
  if (visibleChars < MIN_TOTAL_VISIBLE_CHARS) return false;

  const pages = Math.max(numPages, 1);
  return visibleChars / pages >= MIN_VISIBLE_CHARS_PER_PAGE;
}

async function readTextLayer(buffer) {
  const data = await pdf(buffer);
  return {
    text: normalizeText(data.text),
    numPages: data.numpages || 0,
  };
}

/**
 * Rasterizes the first few pages to JPEG using pdf-to-img (pdfjs + napi canvas).
 * Loaded lazily so the heavy dependency is only paid for on the fallback path.
 */
async function renderPdfPages(buffer) {
  let toImages;
  try {
    ({ pdf: toImages } = await import("pdf-to-img"));
  } catch (error) {
    throw new PdfExtractionError(
      "RASTERIZER_UNAVAILABLE",
      "Scanned PDF support is unavailable on this deployment.",
      error,
    );
  }

  let document;
  try {
    document = await toImages(buffer, {
      scale: RENDER_SCALE,
      format: "jpg",
      // Without an explicit background, transparent PDFs render black in JPEG.
      renderParams: { background: "#ffffff" },
      // verbosity 0 keeps pdfjs warnings out of the server logs.
      docInitParams: { verbosity: 0, isEvalSupported: false },
    });
  } catch (error) {
    if (isEncryptionError(error)) {
      throw new PdfExtractionError(
        "ENCRYPTED_PDF",
        "This PDF is password protected. Please upload an unlocked copy.",
        error,
      );
    }
    throw new PdfExtractionError(
      "PDF_UNREADABLE",
      "Failed to process the PDF file. It might be corrupted.",
      error,
    );
  }

  try {
    const pageCount = Math.min(document.length, MAX_VISION_PAGES);
    const images = [];
    let totalBytes = 0;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const image = await document.getPage(pageNumber);
      if (!image || image.length === 0) continue;

      if (images.length > 0 && totalBytes + image.length > MAX_TOTAL_IMAGE_BYTES) {
        console.warn("[PDF] Remaining pages skipped: image payload too large.");
        break;
      }

      images.push(image);
      totalBytes += image.length;
    }

    if (images.length === 0) {
      throw new PdfExtractionError(
        "PDF_UNREADABLE",
        "Failed to process the PDF file. It might be corrupted.",
      );
    }

    console.log(
      `[PDF] Rendered ${images.length}/${document.length} page(s) for vision (${Math.round(
        totalBytes / 1024,
      )} KB).`,
    );

    return images;
  } finally {
    await document.destroy().catch(() => {});
  }
}

async function transcribeWithVision(buffer) {
  const renderStartedAt = Date.now();
  const images = await renderPdfPages(buffer);
  const renderMs = Date.now() - renderStartedAt;

  const visionStartedAt = Date.now();
  let transcription;
  try {
    transcription = await transcribeResumeImages(images);
  } catch (error) {
    throw new PdfExtractionError(
      "VISION_FAILED",
      "This looks like a scanned PDF and we could not read it automatically. Please upload a clearer scan or a text-based PDF.",
      error,
    );
  }
  const visionMs = Date.now() - visionStartedAt;

  const cleaned = normalizeText(
    cleanVisionMarkup(transcription || "")
      .split(EMPTY_PAGE_SENTINEL)
      .join("\n")
  );

  if (countVisibleChars(cleaned) < 50) {
    throw new PdfExtractionError(
      "VISION_FAILED",
      "This looks like a scanned PDF and we could not read it automatically. Please upload a clearer scan or a text-based PDF.",
    );
  }

  return {
    text: cleaned,
    renderMs,
    visionMs,
    pageImages: images.length,
    imageBytes: images.reduce((total, image) => total + image.length, 0),
  };
}

/**
 * Extracts resume text from a PDF buffer.
 * Tries the embedded text layer first; falls back to a vision model for
 * scanned/image-only documents.
 *
 * @returns {Promise<{ text: string, method: "text" | "vision", numPages: number }>}
 */
async function extractResumeText(buffer) {
  const startedAt = Date.now();
  let textLayer = null;
  let textLayerError = null;

  try {
    textLayer = await readTextLayer(buffer);
  } catch (error) {
    if (isEncryptionError(error)) {
      throw new PdfExtractionError(
        "ENCRYPTED_PDF",
        "This PDF is password protected. Please upload an unlocked copy.",
        error,
      );
    }
    textLayerError = error;
    console.warn(`[PDF] Text layer extraction failed: ${error.message}`);
  }

  const textLayerMs = Date.now() - startedAt;
  const visibleChars = textLayer ? countVisibleChars(textLayer.text) : 0;

  if (textLayer && hasUsableTextLayer(textLayer.text, textLayer.numPages)) {
    const totalMs = Date.now() - startedAt;
    console.log(
      `[PDF] method=text pages=${textLayer.numPages} chars=${visibleChars} ` +
        `textLayerMs=${textLayerMs} totalMs=${totalMs}`,
    );

    return {
      text: textLayer.text,
      method: "text",
      numPages: textLayer.numPages,
      timings: { textLayerMs, totalMs },
    };
  }

  console.warn(
    `[PDF] No usable text layer (${textLayer ? `${visibleChars} visible chars` : "parser error"}). ` +
      `Falling back to vision. textLayerMs=${textLayerMs}`,
  );

  const vision = await transcribeWithVision(buffer);
  const totalMs = Date.now() - startedAt;

  console.log(
    `[PDF] method=vision pages=${textLayer?.numPages || "?"} chars=${countVisibleChars(vision.text)} ` +
      `pageImages=${vision.pageImages} imageKB=${Math.round(vision.imageBytes / 1024)} ` +
      `textLayerMs=${textLayerMs} renderMs=${vision.renderMs} visionMs=${vision.visionMs} totalMs=${totalMs}`,
  );

  return {
    text: vision.text,
    method: "vision",
    numPages: textLayer?.numPages || 0,
    textLayerError: textLayerError?.message || null,
    timings: {
      textLayerMs,
      renderMs: vision.renderMs,
      visionMs: vision.visionMs,
      totalMs,
    },
  };
}

module.exports = { extractResumeText, PdfExtractionError };
