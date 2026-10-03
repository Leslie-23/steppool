// Extends app.json with settings that depend on credentials you may not have yet.
// Google Sign-In's native plugin refuses to build without the iOS URL scheme, so it is only added
// once GOOGLE_IOS_URL_SCHEME is set (the "reversed client id" from Google Cloud, e.g.
// com.googleusercontent.apps.1234-abcd). Until then the app simply hides the Google button.
module.exports = ({ config }) => {
  // Reversed iOS client id (public, not a secret). Override with GOOGLE_IOS_URL_SCHEME.
  const scheme = process.env.GOOGLE_IOS_URL_SCHEME ?? 'com.googleusercontent.apps.1009173626527-5kg1gke7bt4j5c8165vv9jalht16r0fl';
  return {
    ...config,
    plugins: [...config.plugins, ...(scheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme: scheme }]] : [])],
  };
};
