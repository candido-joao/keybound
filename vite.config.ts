import { fileURLToPath } from 'node:url';
import { type Connect, type Plugin, defineConfig } from 'vite';

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Without the slash, /wiki falls through to the game's page instead of the wiki's index.html. */
const addWikiSlash: Connect.NextHandleFunction = (req, res, next) => {
  const [path, query] = (req.url ?? '').split('?');
  if (path !== '/wiki') return next();
  res.statusCode = 301;
  res.setHeader('Location', query ? `/wiki/?${query}` : '/wiki/');
  res.end();
};

const wikiSlash: Plugin = {
  name: 'wiki-slash',
  configureServer: (server) => void server.middlewares.use(addWikiSlash),
  configurePreviewServer: (server) => void server.middlewares.use(addWikiSlash),
};

export default defineConfig({
  plugins: [wikiSlash],
  build: {
    // Phaser alone is ~1.2 MB minified; it can't be split further.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      // The wiki is a page of its own at /wiki/, built from the same content registries as the game.
      input: { main: page('index.html'), wiki: page('wiki/index.html') },
      output: {
        // Keep Phaser in its own chunk so game-code changes don't bust its cache.
        codeSplitting: {
          groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }],
        },
      },
    },
  },
});
