import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    ignores: ["_site/**", "node_modules/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser globals
        console: "readonly",
        document: "readonly",
        window: "readonly",
        location: "readonly",
        // Node.js globals
        module: "readonly",
        require: "readonly",
        process: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        FormData: "readonly",
        fetch: "readonly",
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
      "semi": ["error", "always"],
      "quotes": ["warn", "double", { "avoidEscape": true }],
    }
  }
];
