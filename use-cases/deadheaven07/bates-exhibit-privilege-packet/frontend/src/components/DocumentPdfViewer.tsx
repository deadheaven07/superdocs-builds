import { useEffect, useRef, useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, Download, Loader2, AlertCircle, FileText } from "lucide-react";
import { clsx } from "clsx";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface DocumentPdfViewerProps {
  packetId: string;
  documentId: string;
  fileName: string;
  pageCount: number;
  batesRange?: string | null;
  onDownload?: () => void;
}

type PDFDoc = { numPages: number };

export function DocumentPdfViewer({
  packetId,
  documentId,
  fileName,
  pageCount,
  batesRange,
  onDownload,
}: DocumentPdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const pdfDocRef = useRef<PDFDoc | null>(null);

  const pdfSource = pdfUrl ? { url: pdfUrl } : null;

  useEffect(() => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();

    fetch(`/api/documents/${packetId}/${documentId}/download`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load PDF: ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load PDF");
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [packetId, documentId]);

  const onDocumentLoadSuccess = useCallback((pdf: PDFDoc) => {
    pdfDocRef.current = pdf;
    setNumPages(pdf.numPages);
    setLoading(false);
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    setError(err.message || "Failed to load PDF document");
    setLoading(false);
  }, []);

  const handlePreviousPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setPageNumber((prev) => Math.min(numPages || pageCount, prev + 1));
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleZoomReset = () => {
    setScale(1.0);
  };

  if (error) {
    return (
      <div className="aspect-video bg-gray-50 rounded-lg border border-red-200 flex flex-col items-center justify-center p-6">
        <AlertCircle className="h-12 w-12 text-red-500 mb-3" />
        <p className="text-red-700 font-medium">Failed to load PDF</p>
        <p className="text-sm text-red-500 text-center px-4 mt-1">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            setPdfUrl(null);
          }}
          className="mt-4 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !pdfSource) {
    return (
      <div className="aspect-video bg-gray-50 rounded-lg border flex flex-col items-center justify-center p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary-600 mb-3" />
        <p className="text-gray-600">Loading PDF...</p>
        <p className="text-xs text-gray-400 mt-1">{fileName}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-gray-400" />
          <div>
            <p className="font-medium text-gray-900 truncate max-w-[200px]">{fileName}</p>
            <p className="text-xs text-gray-500">
              {numPages || pageCount} page{((numPages || pageCount) !== 1 ? "s" : "")}
              {batesRange && ` • Bates: ${batesRange}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onDownload && (
            <button
              onClick={onDownload}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Download original"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto relative" style={{ minHeight: 400 }}>
        <Document
          file={pdfSource}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          renderMode="canvas"
        >
          <Page
            pageNumber={pageNumber}
            width={pageNumber > 0 ? 800 * scale : undefined}
            renderAnnotationLayer={false}
            renderTextLayer={false}
          />
        </Document>
      </div>

      <div className="flex items-center justify-between p-3 border-t bg-gray-50">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviousPage}
            disabled={pageNumber <= 1}
            className={clsx(
              "p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
              "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
            )}
            title="Previous page"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="px-3 py-1 text-sm font-mono text-gray-700 bg-gray-100 rounded">
            {pageNumber} / {numPages || pageCount}
          </span>
          <button
            onClick={handleNextPage}
            disabled={pageNumber >= (numPages || pageCount)}
            className={clsx(
              "p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
              "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
            )}
            title="Next page"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className={clsx(
              "p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
              "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
            )}
            title="Zoom out"
          >
            <Minus className="h-5 w-5" />
          </button>
          <span className="px-3 py-1 text-sm font-mono text-gray-700 bg-gray-100 rounded w-16 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={scale >= 3.0}
            className={clsx(
              "p-2 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
              "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
            )}
            title="Zoom in"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            onClick={handleZoomReset}
            className={clsx(
              "p-2 rounded-lg transition-colors ml-1",
              "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
            )}
            title="Reset zoom"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}