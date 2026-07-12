module.exports = {
  root: true,
  extends: ["next/core-web-vitals"],
  overrides: [
    {
      files: [
        ".eslintrc.cjs",
        "*.config.js",
        "*.config.cjs",
        "*.config.mjs",
        "contracts/**/*.js",
        "monitor/**/*.js",
        "scripts/**/*.{js,mjs,cjs}",
      ],
      env: { node: true },
    },
    {
      files: ["public/sw.js"],
      env: { browser: true, serviceworker: true },
    },
    {
      // Legacy copy debt is recorded here so Slice 1 does not edit product UI.
      files: ["src/app/docs/page.tsx", "src/app/preview/page.tsx"],
      rules: { "react/no-unescaped-entities": "off" },
    },
    {
      // Preserve the current effect timing until a behavior slice owns the fix.
      files: ["src/app/execute/page.tsx"],
      rules: { "react-hooks/exhaustive-deps": "off" },
    },
  ],
};
