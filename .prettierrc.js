const valoraPrettierConfig = require('@valora/prettier-config')

/** @type {import("prettier").Config} */
module.exports = {
  ...valoraPrettierConfig,
  plugins: ['prettier-plugin-solidity'],
}
