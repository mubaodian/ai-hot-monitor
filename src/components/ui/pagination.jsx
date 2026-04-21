export function Pagination({ meta, onChange }) {
  if (!meta || meta.total <= meta.pageSize) {
    return null;
  }

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
      <div className="text-sm text-white/45">
        第 {meta.start}-{meta.end} 条，共 {meta.total} 条
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, meta.currentPage - 1))}
          disabled={meta.currentPage === 1}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          上一页
        </button>
        <span className="min-w-16 text-center text-sm text-white/75">
          {meta.currentPage} / {meta.totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(meta.totalPages, meta.currentPage + 1))}
          disabled={meta.currentPage === meta.totalPages}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
