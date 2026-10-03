/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'StepPoolWidget',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: '#07080A',
    $accent: '#D7FF3A',
    volt: '#D7FF3A',
    gold: '#E8C36A',
    ink: '#F4F1EA',
    muted: '#8A8F98',
    track: '#15181D',
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
