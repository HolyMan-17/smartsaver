import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B82F6',
  },
  scrollContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
    marginTop: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  
  // Days Selector
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircleActive: {
    backgroundColor: '#3B82F6',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
  },
  dayTextActive: {
    color: '#FFFFFF',
  },

  // Active toggle
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
    paddingVertical: 5,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  toggleDesc: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    maxWidth: '85%'
  },

  // Time Picker Row
  timeRow: {
    flexDirection: 'column',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  timeLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
  },
  pickersWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  pickerHour: {
    flex: 1,
    height: 50,
  },
  pickerPeriod: {
    flex: 1,
    height: 50,
    backgroundColor: '#F1F5F9',
  }
});
