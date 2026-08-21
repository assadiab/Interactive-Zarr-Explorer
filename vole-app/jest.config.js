module.exports = {
  preset: "ts-jest",
  transform: {
    "^.+\\.(ts|tsx)?$": "ts-jest",
    // es2020 target: zarrita uses BigInt literals (`…n`), which the default es2018
    // target rejects outright. `.mjs` is included because the ESM-only zarrita chain
    // drags in dependencies published only in that form.
    "^.+\\.(js|jsx|mjs)$": ["esbuild-jest", { target: "es2020" }],
  },
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/scripts/jestSetup.js"],
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
    // zarrita and @zarrita/* are ESM-only: their `exports` maps declare an `import`
    // condition and no `require` one, so Jest's resolver cannot find them by package
    // name. Mapping each entry point to its file bypasses the map; the files are then
    // transformed to CJS, since `transformIgnorePatterns` does not exclude node_modules.
    // Done per package rather than via `customExportConditions`, which would also
    // redirect Jest's own dependencies to their ESM builds and break the runner.
    "^zarrita$": "<rootDir>/node_modules/zarrita/dist/src/index.js",
    "^@zarrita/storage$": "<rootDir>/node_modules/@zarrita/storage/dist/src/index.js",
    "^@zarrita/storage/(.*)$": "<rootDir>/node_modules/@zarrita/storage/dist/src/$1.js",
  },
  transformIgnorePatterns: ["<rootDir>/node_modules/three/examples/(?!jsm/)"],
};
