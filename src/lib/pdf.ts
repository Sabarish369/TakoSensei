/**
 * Minimal client-side text extraction for dropped files.
 * Supports plain text files and PDFs (via pdfjs-dist if available).
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const pdfjs = await import("pdfjs-dist");
      if (typeof window !== "undefined" && !(pdfjs as any).GlobalWorkerOptions?.workerSrc) {
        (pdfjs as any).GlobalWorkerOptions.workerSrc =
          `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjs as any).version}/pdf.worker.min.mjs`;
      }
      const buf = await file.arrayBuffer();
      const loading = (pdfjs as any).getDocument({ data: new Uint8Array(buf) });
      const doc = await loading.promise;
      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += (content.items as any[]).map((it: any) => it.str).join(" ") + "\n";
      }
      return text.trim() || (await file.text());
    } catch {
      // fallback
      return await file.text();
    }
  }
  // txt, md, etc.
  return await file.text();
}
