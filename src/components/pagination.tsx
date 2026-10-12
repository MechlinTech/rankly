"use client";

import { useId, useRef } from "react";

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): T[] {
  if (!items || items.length === 0) return [];
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function getPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  pageSizeOptions = [5, 10, 25, 50],
  onPageChange,
  onPageSizeChange,
  className = "",
}: PaginationProps) {
  const pageSizeId = useId();
  const containerRef = useRef<HTMLDivElement>(null);


  const minOption = pageSizeOptions.length > 0 ? Math.min(...pageSizeOptions) : pageSize;

  // Don't show controls if there are no items or if all items fit on a single page at the minimum page size
  if (totalItems <= 0 || (totalItems <= pageSize && totalItems <= minOption)) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  const handlePageChange = (newPage: number) => {
    if (newPage === safePage || newPage < 1 || newPage > totalPages) return;

    // Capture the current scroll position of the active scroll container (<main> or window)
    const scrollContainer =
      containerRef.current?.closest("main") ||
      (typeof document !== "undefined" ? document.querySelector("main") : null);

    const prevScrollTop = scrollContainer
      ? scrollContainer.scrollTop
      : typeof window !== "undefined"
        ? window.scrollY
        : 0;


    const tableWrapper = containerRef.current?.previousElementSibling as HTMLElement | null;
    if (tableWrapper) {
      tableWrapper.style.minHeight = "";
    }

    onPageChange(newPage);

    // Preserve the user's scroll position so navigation never unexpectedly jumps to top
    const restoreScroll = () => {
      if (scrollContainer) {
        scrollContainer.scrollTop = prevScrollTop;
      } else if (typeof window !== "undefined") {
        window.scrollTo({ top: prevScrollTop, behavior: "instant" });
      }
    };

    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(restoreScroll);
    }
    if (typeof setTimeout !== "undefined") {
      setTimeout(restoreScroll, 0);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    const tableWrapper = containerRef.current?.previousElementSibling as HTMLElement | null;
    if (tableWrapper) {
      tableWrapper.style.minHeight = "";
    }

    const scrollContainer =
      containerRef.current?.closest("main") ||
      (typeof document !== "undefined" ? document.querySelector("main") : null);

    const prevScrollTop = scrollContainer
      ? scrollContainer.scrollTop
      : typeof window !== "undefined"
        ? window.scrollY
        : 0;

    if (onPageSizeChange) {
      onPageSizeChange(newSize);
    }

    const restoreScroll = () => {
      if (scrollContainer) {
        scrollContainer.scrollTop = prevScrollTop;
      } else if (typeof window !== "undefined") {
        window.scrollTo({ top: prevScrollTop, behavior: "instant" });
      }
    };

    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(restoreScroll);
    }
    if (typeof setTimeout !== "undefined") {
      setTimeout(restoreScroll, 0);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Showing <span className="font-medium text-slate-700 dark:text-slate-300">{startItem}</span>–
          <span className="font-medium text-slate-700 dark:text-slate-300">{endItem}</span> of{" "}
          <span className="font-medium text-slate-700 dark:text-slate-300">{totalItems}</span>
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <label htmlFor={pageSizeId} className="text-slate-500 dark:text-slate-400">
              Per page:
            </label>
            <select
              id={pageSizeId}
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                handlePageSizeChange(newSize);
              }}
              aria-label="Items per page"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-slate-700"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="hidden sm:inline">
          Page <span className="font-medium text-slate-700 dark:text-slate-300">{safePage}</span> of{" "}
          <span className="font-medium text-slate-700 dark:text-slate-300">{totalPages}</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handlePageChange(safePage - 1)}
            disabled={safePage <= 1}
            aria-label="Previous page"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Previous
          </button>
          <div className="flex items-center gap-1">
            {pageNumbers.map((p, idx) =>
              p === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-1.5 py-1 text-xs text-slate-400 select-none">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePageChange(p)}
                  aria-label={`Page ${p}`}
                  aria-current={p === safePage ? "page" : undefined}
                  className={
                    p === safePage
                      ? "inline-flex items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:border-white dark:bg-white dark:text-slate-900"
                      : "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }
                >
                  {p}
                </button>
              )
            )}
          </div>
          <button
            type="button"
            onClick={() => handlePageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            aria-label="Next page"
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
