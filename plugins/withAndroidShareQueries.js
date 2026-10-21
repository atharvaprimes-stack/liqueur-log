const { withAndroidManifest } = require('@expo/config-plugins');

/** Lets Android 11+ resolve WhatsApp / ACTION_SEND for bill PDF sharing. */
function withAndroidShareQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const queries = Array.isArray(manifest.queries) ? manifest.queries : [];
    const block = {
      package: [
        { $: { 'android:name': 'com.whatsapp' } },
        { $: { 'android:name': 'com.whatsapp.w4b' } },
      ],
      intent: [
        {
          action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
          data: [{ $: { 'android:mimeType': 'application/pdf' } }],
        },
      ],
    };
    const already = queries.some(
      (entry) =>
        Array.isArray(entry.package) &&
        entry.package.some((pkg) => pkg?.$?.['android:name'] === 'com.whatsapp'),
    );
    if (!already) {
      queries.push(block);
    }
    manifest.queries = queries;
    return config;
  });
}

module.exports = withAndroidShareQueries;
