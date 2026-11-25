import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["apps/**/*.ts", "apps/**/*.tsx", "packages/**/*.ts"],
  ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
  },
});
