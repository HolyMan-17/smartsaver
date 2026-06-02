import { StyleSheet } from 'react-native';

export const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 15,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  listContainer: {
    padding: 20,
  },
  deviceCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  deviceIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  deviceMac: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  deviceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceMetaText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: 12,
  },
  chevron: {
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // Modal Styles
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: 20,
    backgroundColor: colors.background,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.borderSoft,
  },
  clearButton: {
    backgroundColor: colors.dangerBg,
  },
  saveButton: {
    backgroundColor: '#3B82F6',
  },
  disabledButton: {
    opacity: 0.5,
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  clearText: {
    color: '#EF4444',
    fontWeight: '600',
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Local/Filter Styles
  filterWrapper: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
