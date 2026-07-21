import { StyleSheet } from 'react-native';

export const getStyles = (colors: any, isDark?: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: 20, paddingTop: 15, paddingBottom: 15,
    backgroundColor: colors.card,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
    flexDirection: 'row', alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: colors.text, marginLeft: 12 },

  scrollContent: { padding: 20, paddingTop: 20, paddingBottom: 40 },

  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: 20,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
    borderWidth: 1, borderColor: colors.borderSoft, marginBottom: 16, width: '100%',
  },

  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 16 },

  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  specLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  specValue: { fontSize: 14, color: colors.text, fontWeight: '700' },
  specDivider: { height: 1, backgroundColor: colors.borderSoft },

  metricContainer: { alignItems: 'center', paddingVertical: 12 },
  metricValue: { fontSize: 42, fontWeight: '800', color: colors.text, letterSpacing: -1 },
  metricLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary,
                textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },

  modeBadge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: colors.borderSoft,
    backgroundColor: colors.background, alignSelf: 'flex-start', marginBottom: 12,
  },
  modeDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  modeText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Most consuming device
  consumerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: 12, padding: 14,
  },
  consumerMac: { fontSize: 13, fontWeight: '600', color: colors.text },
  consumerPower: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  consumerPowerValue: { fontSize: 16, fontWeight: '800', color: '#F59E0B' },

  // Suggestions
  suggestionCard: {
    backgroundColor: colors.background, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  suggestionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  suggestionMac: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  suggestionStats: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 8, marginBottom: 12,
    backgroundColor: colors.card, borderRadius: 10,
  },
  suggestionStat: { alignItems: 'center' },
  suggestionStatValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  suggestionStatLabel: { fontSize: 9, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginTop: 2 },

  shutDownButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EF4444', borderRadius: 10, paddingVertical: 10, gap: 6,
  },
  shutDownButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // Auto actions
  autoActionCard: {
    backgroundColor: colors.background, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.borderSoft, marginBottom: 10,
  },
  autoActionMac: { fontSize: 13, fontWeight: '600', color: colors.text },
  autoActionReason: { fontSize: 12, color: colors.textSecondary, marginTop: 6, lineHeight: 16 },
  autoActionPower: { fontSize: 11, fontWeight: '700', color: '#8B5CF6', marginTop: 4 },

  // Priority badge
  priorityBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  priorityBadgeText: { fontSize: 11, fontWeight: '800' },

  // Empty state
  emptyCard: {
    alignItems: 'center', paddingVertical: 30,
    backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.borderSoft, marginBottom: 16,
  },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },

  predictionHabitoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.infoBg, borderRadius: 10, padding: 12,
  },
  predictionHabitoValue: { fontSize: 13, fontWeight: '700', color: '#8B5CF6' },
  predictionLearningText: { fontSize: 13, fontWeight: '600', color: '#8B5CF6' },
  predictionSectionLabel: {
    fontSize: 11, fontWeight: '800', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  predictionDeviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  predictionDeviceName: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.text },
  predictionDeviceProb: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  predictionDeviceLoad: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, width: 44, textAlign: 'right' },
  predictionSuggestionCard: {
    marginTop: 14, backgroundColor: colors.dangerBg, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: isDark ? 'rgba(239,68,68,0.3)' : '#FECACA',
  },
});
