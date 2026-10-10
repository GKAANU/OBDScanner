/**
 * expo-notifications adds the aps-environment (push) entitlement. Otova only
 * schedules LOCAL notifications, which need no entitlement, and the App ID
 * has no Push Notifications capability. Strip it so signing succeeds.
 */
const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
