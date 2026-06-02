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
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  clearButton: {
    padding: 8,
    borderRadius: 8,
  },
  listContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  
  // Notification Card
  notifCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    flexDirection: 'row',
    alignItems: 'flex-start',
    position: 'relative',
  },
  notifCardUnread: {
    borderColor: '#3B82F6',
    backgroundColor: colors.infoBg || 'rgba(59, 130, 246, 0.03)',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    paddingRight: 8,
  },
  notifTitleUnread: {
    color: colors.text,
    fontWeight: '800',
  },
  notifTime: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  notifBody: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  notifBodyUnread: {
    color: colors.text,
  },
  
  // Swipe/Interactive Actions
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    justifyContent: 'flex-end',
    gap: 15,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  
  // Unread Dot Indicator
  unreadDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.borderSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
