import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

function aiDevProxyPlugin(): Plugin {
  return {
    name: 'ai-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai-proxy', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          });
          res.end();
          return;
        }

        const targetUrl = req.headers['x-target-url'] as string;
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Missing x-target-url header' }));
          return;
        }

        const chunks: Buffer[] = [];
        const controller = new AbortController();
        req.on('aborted', () => controller.abort());
        res.on('close', () => {
          if (!res.writableEnded) controller.abort();
        });
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          try {
            const bodyBuf = Buffer.concat(chunks);
            const forwardHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(req.headers)) {
              if (
                !['host', 'x-target-url', 'origin', 'referer', 'content-length', 'connection'].includes(
                  k.toLowerCase()
                ) &&
                typeof v === 'string'
              ) {
                forwardHeaders[k] = v;
              }
            }

            const targetResp = await fetch(targetUrl, {
              method: req.method || 'POST',
              headers: forwardHeaders,
              body: bodyBuf.length > 0 ? bodyBuf : undefined,
              signal: controller.signal
            });

            res.writeHead(targetResp.status, {
              'Content-Type': targetResp.headers.get('content-type') || 'application/json',
              'Access-Control-Allow-Origin': '*'
            });

            if (targetResp.body) {
              const reader = targetResp.body.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
              }
            }
            res.end();
          } catch (e: any) {
            if (controller.signal.aborted || res.destroyed) return;
            if (res.headersSent) {
              res.destroy(e instanceof Error ? e : undefined);
            } else {
              res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: e.message || 'Proxy request failed' }));
            }
          }
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), aiDevProxyPlugin()],
  build: { chunkSizeWarningLimit: 1600, },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    // Exported evidence HTML must not reload the editor while another check is running.
    watch: { ignored: ['**/doc/**/evidence/**', '**/test/visual-baselines/**'] }
  }
});
