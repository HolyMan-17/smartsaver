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
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 15,
    padding: 5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  listContainer: {
    padding: 20,
    paddingBottom: 40,
  },

  // Timeline styles
  logItemContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  timelineColumn: {
    alignItems: 'center',
    marginRight: 15,
    width: 24,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    zIndex: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.borderSoft,
    marginTop: 4,
    marginBottom: -24, // Connects to the next dot
    zIndex: 1,
  },

  // Log Card
  logCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  logTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  logTime: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  logMessage: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  deviceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.borderSoft,
    marginTop: 10,
  },
  deviceBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  }
});
