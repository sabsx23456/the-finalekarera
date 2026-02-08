import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
function vercelApiDevMiddleware(): Plugin {
  // Vercel-style serverless handlers (req,res) live under `/api/**`.
  // In production, Vercel runs them. In local dev (`vite`), we mount them as connect middleware
  // so features like AI Vision work without requiring `vercel dev`.
  return {
    name: 'vercel-api-dev-middleware',
    apply: 'serve',
    configureServer(server) {
      const patchRes = (res: any) => {
        if (typeof res.status !== 'function') {
          res.status = (code: number) => {
            res.statusCode = code;
            return res;
          };
        }
        if (typeof res.json !== 'function') {
          res.json = (obj: unknown) => {
            if (!res.headersSent) res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(obj));
            return res;
          };
        }
        if (typeof res.send !== 'function') {
          res.send = (body: unknown) => {
            if (body && typeof body === 'object') return res.json(body);
            res.end(String(body ?? ''));
            return res;
          };
        }
        return res;
      };

      const readBody = (req: any) =>
        new Promise<string>((resolve, reject) => {
          let out = '';
          req.on('data', (chunk: any) => (out += String(chunk)));
          req.on('end', () => resolve(out));
          req.on('error', reject);
        });

      server.middlewares.use('/api', async (req, res, next) => {
        try {
          const url = String(req.url || '');
          const pathname = (url.split('?')[0] || '').replace(/\/+$/, '');
          if (!pathname) return next();

          // /api/openrouter/vision -> /api/openrouter/vision.ts
          const moduleId = `/api${pathname}.ts`;
          const fsPath = path.resolve(process.cwd(), moduleId.slice(1));
          if (!fs.existsSync(fsPath)) return next();

          if (req.method && !['GET', 'HEAD'].includes(String(req.method).toUpperCase())) {
            const raw = await readBody(req);
            (req as any).body = raw;
          }

          const mod: any = await server.ssrLoadModule(moduleId);
          const handler = mod?.default;
          if (typeof handler !== 'function') return next();

          patchRes(res);
          await handler(req, res);
        } catch (err) {
          console.error('[api-dev]', err);
          if (!(res as any).headersSent) {
            (res as any).statusCode = 500;
            (res as any).setHeader?.('Content-Type', 'application/json');
          }
          (res as any).end?.(JSON.stringify({ error: (err as any)?.message || 'Server error' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load *all* env vars (not only VITE_*), so local `/api/**` handlers can read secrets from `.env`.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) process.env[k] = v;
  }

  return {
    base: '/',
    plugins: [vercelApiDevMiddleware(), react(), tailwindcss()],
    server: {
      proxy: {
        '/wccstream': {
          target: 'https://stream.wccgames7.xyz',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
