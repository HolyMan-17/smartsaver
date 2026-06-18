Frontend fix
Wherever you call PATCH /api/users/settings, map your local state keys to Spanish before sending:
// If your SettingsScreen state uses:
// { notifyCritical, notifyWarnings, aiControlEnabled, autoKillP3Enabled }
const payload = {
  notificaciones_criticas: notifyCritical,
  notificaciones_advertencias: notifyWarnings,
  ai_control_habilitado: aiControlEnabled,
  auto_apagado_low_priority: autoKillP3Enabled,
};
await api.patch('/api/users/settings', payload);
And when loading from GET /api/users/settings, map back:
setNotifyCritical(data.notificaciones_criticas);
setNotifyWarnings(data.notificaciones_advertencias);
Quick check