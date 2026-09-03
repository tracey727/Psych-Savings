import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.wrangler/**"],
  },
  {
    rules: {
      // Interface-mandated but intentionally-unused parameters (e.g. a
      // fake implementation that ignores an argument the real
      // implementation needs) are named with a leading underscore.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
