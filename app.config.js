const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'Liqueur Log',
  slug: 'liqueur-log',
  scheme: 'liqueur-log',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-status-bar',
    'expo-sharing',
    '@react-native-community/datetimepicker',
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Allow Liqueur Log to use the microphone for voice search.',
        speechRecognitionPermission: 'Allow Liqueur Log to turn speech into search text.',
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  android: {
    package: 'com.liqueurlog.app',
    permissions: ['android.permission.RECORD_AUDIO'],
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#000000',
    },
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  extra: {
    router: {},
    eas: {
      projectId: 'c123e25f-c985-43f9-ae4b-2aec37c07f01',
    },
    supabaseUrl,
    supabaseAnonKey,
  },
  owner: 'atharvaprimes',
};
