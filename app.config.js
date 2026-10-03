// Extends app.json with settings that depend on credentials you may not have yet.
// Google Sign-In's native plugin refuses to build without the iOS URL scheme, so it is only added
// once GOOGLE_IOS_URL_SCHEME is set (the "reversed client id" from Google Cloud, e.g.
// com.googleusercontent.apps.1234-abcd). Until then the app simply hides the Google button.
module.exports = ({ config }) => {
  const scheme = process.env.GOOGLE_IOS_URL_SCHEME;
  return {
    ...config,
    plugins: [...config.plugins, ...(scheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme: scheme }]] : [])],
  };
};
