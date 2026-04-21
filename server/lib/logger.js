import { nowIso } from './utils.js';

function serializeMeta(meta = {}) {
  try {
    return JSON.stringify(meta);
  } catch {
    return '{"error":"meta_not_serializable"}';
  }
}

export function createLogger(scope) {
  function write(level, message, meta = {}) {
    const timestamp = nowIso();
    const line = `[${timestamp}] [${level.toUpperCase()}] [${scope}] ${message}`;
    const metaText = Object.keys(meta).length ? ` ${serializeMeta(meta)}` : '';

    if (level === 'error') {
      console.error(`${line}${metaText}`);
      return;
    }

    if (level === 'warn') {
      console.warn(`${line}${metaText}`);
      return;
    }

    console.log(`${line}${metaText}`);
  }

  return {
    debug(message, meta) {
      write('debug', message, meta);
    },
    info(message, meta) {
      write('info', message, meta);
    },
    warn(message, meta) {
      write('warn', message, meta);
    },
    error(message, meta) {
      write('error', message, meta);
    }
  };
}
