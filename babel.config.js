module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        // Strips every console.* call from release bundles. Belt-and-braces for
        // the class of bug where a debug log leaks a token or PII into logcat.
        plugins: ['transform-remove-console'],
      },
    },
  };
};
