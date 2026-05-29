const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable experimental package exports to force Metro to resolve 
// dependencies (like Zustand v5) to their compatible CommonJS (CJS) 
// versions, which don't use 'import.meta' (which breaks Hermes/web bundle).
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
