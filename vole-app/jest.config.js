module.exports = {
  preset: "ts-jest",
  transform: {
    "^.+\\.(ts|tsx)?$": "ts-jest",
    "^.+\\.(js|jsx)$": "esbuild-jest",
  },
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    storageQuota: 5000,
  },
  testPathIgnorePatterns: ["<rootDir>/es/"],

  // From https://jestjs.io/docs/webpack#mocking-css-modules
  moduleNameMapper: {
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/scripts/jestAssetTransformer.js",
    "\\.(css|less)$": "identity-obj-proxy",
    // Mirrors the `three$` alias in webpack.common.js: vole-app has no `three` of its own and
    // shares vole-core's single install. Without this, any test touching a module that imports
    // `three` fails to resolve it.
    "^three$": "<rootDir>/../vole-core/node_modules/three",
  },
  transformIgnorePatterns: ["<rootDir>/node_modules/three/examples/(?!jsm/)"],
};
