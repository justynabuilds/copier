import { defineConfig } from "vite"

// Library build: one script a buyer can drop into any site.
//   dist/copier.js       ESM   (import "…/copier.js")
//   dist/copier.iife.js  classic <script src> for Webflow embeds, WordPress, Squarespace, Shopify…
export default defineConfig({
  build: {
    lib: {
      entry: "src/element/index.ts",
      name: "PhotoCopier",
      formats: ["es", "iife"],
      fileName: (format) => (format === "es" ? "copier.js" : "copier.iife.js"),
    },
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
})
