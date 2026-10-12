const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts = [...new Set([...(config.resolver.assetExts ?? []), 'wasm'])];
config.resolver.sourceExts = (config.resolver.sourceExts ?? []).filter((extension) => extension !== 'wasm');

module.exports = withNativeWind(config, { input: './global.css' });
