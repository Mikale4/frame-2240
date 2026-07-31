import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-only screenshot sink.
 *
 * POST /__shot  { name, data }  where `data` is a canvas data URL. Writes
 * renders/debug/<name>.png. This lets automated checks (and the browser console)
 * capture what the game actually drew, which is otherwise impossible from inside
 * a sandboxed page. Never included in a production build.
 */
function screenshotSink(): Plugin {
  return {
    name: 'bsr-screenshot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(Buffer.from(c)));
        req.on('end', () => {
          try {
            const { name, data } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const safe = String(name || 'shot').replace(/[^a-z0-9_.-]/gi, '_');
            const b64 = String(data).replace(/^data:image\/\w+;base64,/, '');
            const dir = path.resolve(process.cwd(), 'renders', 'debug');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${safe}.png`);
            fs.writeFileSync(file, Buffer.from(b64, 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

/**
 * `publicDir` is assets/, which also holds authoring inputs rather than runtime
 * data: the editable Blender sources, and the audio audition page used to review
 * generated cues by ear. Neither belongs in a shipped build.
 */
function stripAuthoringSources(): Plugin {
  return {
    name: 'bsr-strip-authoring-sources',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(process.cwd(), 'dist');
      fs.rmSync(path.join(dist, 'blender'), { recursive: true, force: true });
      // Underscore-prefixed entries under assets are authoring inputs, never
      // runtime data: audition pages, and the multi-megabyte source images the
      // pilot portraits were keyed from. Shipping the latter would add ~14 MB
      // of art the game never loads.
      for (const rel of ['audio', 'sprites/pilots', 'sprites/mechs']) {
        const dir = path.join(dist, ...rel.split('/'));
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          if (f.startsWith('_')) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
        }
      }

      // The per-part mech PNGs are the atlas packer's input, not runtime data —
      // the game loads `<mech>.atlas.png` and never the loose parts. They stay in
      // assets/ so the atlases can be rebuilt, but shipping both would add ~3.9 MB
      // of files nothing requests.
      const mechs = path.join(dist, 'sprites', 'mechs');
      if (fs.existsSync(mechs)) {
        for (const f of fs.readdirSync(mechs)) {
          if (f.endsWith('.png') && !f.endsWith('.atlas.png')) {
            fs.rmSync(path.join(mechs, f), { force: true });
          }
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  // Blender writes game-ready art straight into assets/, and CLAUDE.md fixes that
  // layout, so serve it as the static root instead of the default public/.
  publicDir: 'assets',
  plugins: [screenshotSink(), stripAuthoringSources()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
