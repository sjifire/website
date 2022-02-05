module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    mocha: true,
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    impliedStrict: true,
  },
  rules: {},
  extends: ["standard", "prettier"],
};
