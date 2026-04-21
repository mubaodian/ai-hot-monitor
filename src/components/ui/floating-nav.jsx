import { Search, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils.js';

export function FloatingNav({
  items,
  searchValue,
  onClearSearch,
  onSearchChange,
  searchPlaceholder,
  searchDisabled = false
}) {
  return (
    <nav className="sticky top-4 z-30 mb-5" aria-label="页面模块导航">
      <div className="mx-auto flex w-full flex-col gap-3 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,14,22,0.96),rgba(7,10,17,0.96))] px-4 py-4 shadow-[0_24px_90px_rgba(0,0,0,0.36)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-white/[0.08] text-white shadow-[0_12px_30px_rgba(0,0,0,0.18)] ring-1 ring-white/8'
                    : 'text-white/50 hover:bg-white/[0.045] hover:text-white'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <label className="group flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-2.5 text-white/44 transition focus-within:border-[#58d6ff]/30 focus-within:bg-white/[0.05] lg:max-w-sm">
          <Search className="h-4 w-4 text-white/36 transition group-focus-within:text-[#58d6ff]" />
          <input
            type="text"
            value={searchValue}
            disabled={searchDisabled}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/26 disabled:cursor-not-allowed disabled:text-white/35"
          />
          {searchValue && !searchDisabled ? (
            <button
              type="button"
              onClick={onClearSearch}
              aria-label="清空搜索"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-white/55 transition hover:bg-white/[0.1] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>
      </div>
    </nav>
  );
}
