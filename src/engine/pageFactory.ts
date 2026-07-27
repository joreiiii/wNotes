import { v4 as uuidv4 } from "uuid";
import type { PageData, PageTemplate } from "../types";
import { getPdfPageSize, loadPdfDocument } from "./pdf/pdfRender";

export const DEFAULT_PAGE_WIDTH = 1653; // A4 @ ~200dpi in page units
export const DEFAULT_PAGE_HEIGHT = 2339;

export function createBlankPage(template: PageTemplate): PageData {
  return {
    id: uuidv4(),
    width: DEFAULT_PAGE_WIDTH,
    height: DEFAULT_PAGE_HEIGHT,
    template,
    pdfRef: null,
    strokes: [],
    textObjects: [],
    imageObjects: [],
  };
}

export async function createPdfPages(assetFile: string, bytes: Uint8Array): Promise<PageData[]> {
  const pdf = await loadPdfDocument(bytes);
  const pages: PageData[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const size = await getPdfPageSize(pdf, i);
    pages.push({
      id: uuidv4(),
      width: size.width,
      height: size.height,
      template: { kind: "blank" },
      pdfRef: { assetFile, pageNumber: i },
      strokes: [],
      textObjects: [],
      imageObjects: [],
    });
  }
  return pages;
}
