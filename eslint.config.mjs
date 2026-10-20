// eslint.config.mjs – checks the plugin against the official Obsidian guidelines.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  // Build/test tooling runs in Node, not in Obsidian – only the plugin source is checked.
  { ignores: ["main.js", "node_modules/", ".test/", "test/", "version-bump.mjs"] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*"],
        },
      },
    },
  },
]);
