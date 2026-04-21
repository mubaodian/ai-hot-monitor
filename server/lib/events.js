import { createId } from './utils.js';

function formatSse(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function createEventHub() {
  const clients = new Map();
  const heartbeat = setInterval(() => {
    for (const client of clients.values()) {
      client.res.write(': heartbeat\n\n');
    }
  }, 20000);

  return {
    addClient(req, res) {
      const id = createId('client');
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      res.write(formatSse('connected', { id }));
      clients.set(id, { req, res });
      req.on('close', () => {
        clients.delete(id);
      });
    },
    broadcast(event, payload) {
      for (const client of clients.values()) {
        client.res.write(formatSse(event, payload));
      }
    },
    close() {
      clearInterval(heartbeat);
      for (const client of clients.values()) {
        client.res.end();
      }
      clients.clear();
    }
  };
}

