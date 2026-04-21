import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(value) {
  if (!value) {
    return '未知时间';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function summarizeSourceConfig(config = {}) {
  const parts = [];

  if (config.queryTemplate) {
    parts.push(`查询模板: ${config.queryTemplate}`);
  }

  if (config.feedUrl) {
    parts.push(`RSS: ${config.feedUrl}`);
  }

  if (Array.isArray(config.urls) && config.urls.length) {
    parts.push(`网页: ${config.urls.length} 个`);
  }

  if (config.queryType) {
    parts.push(`模式: ${config.queryType}`);
  }

  if (config.limit !== undefined) {
    parts.push(`上限: ${config.limit}`);
  }

  return parts.length ? parts.join(' / ') : '未配置额外参数';
}

export function paginate(items, page, pageSize) {
  const safePage = Math.max(page, 1);
  const totalPages = Math.max(Math.ceil(items.length / pageSize), 1);
  const currentPage = Math.min(safePage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, items.length);

  return {
    items: items.slice(start, start + pageSize),
    currentPage,
    totalPages,
    start: items.length ? start + 1 : 0,
    end,
    total: items.length
  };
}
