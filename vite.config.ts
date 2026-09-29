import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Phaser alone is ~1.2 MB minified; it can't be split further.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // Keep Phaser in its own chunk so game-code changes don't bust its cache.
        codeSplitting: {
          groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }],
        },
      },
    },
  },
});
