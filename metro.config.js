const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts = [...new Set([...(config.resolver.assetExts ?? []), 'wasm'])];
config.resolver.sourceExts = (config.resolver.sourceExts ?? []).filter((extension) => extension !== 'wasm');

const wrapped = withNativeWind(config, { input: './global.css' });
const previousResolveRequest = wrapped.resolver.resolveRequest;
wrapped.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'pdf-lib') {
    return {
      type: 'sourceFile',
      filePath: path.join(__dirname, 'node_modules/pdf-lib/dist/pdf-lib.esm.js'),
    };
  }
  // expo-notifications is native-only; its web resolution is broken in this SDK.
  if (platform === 'web' && moduleName === 'expo-notifications') {
    return {
      type: 'sourceFile',
      filePath: path.join(__dirname, 'src/notifications/expoNotifications.web.ts'),
    };
  }
  if (typeof previousResolveRequest === 'function') {
    return previousResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = wrapped;
