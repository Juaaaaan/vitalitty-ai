import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    reporters: ["default", "html"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["app/**/*.tsx", "src/**/*.tsx"],
      exclude: [
        "node_modules/",
        "**/__tests__/**",
        "**/*.test.tsx",
        "**/*.spec.tsx",
      ],
    },
  },
});
