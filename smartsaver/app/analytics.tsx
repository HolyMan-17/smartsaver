import { AnalyticsScreen } from '../src/screens/AnalyticsScreen/AnalyticsScreen';
import { useLocalSearchParams } from 'expo-router';

export default function AnalyticsRoute() {
  const { mac } = useLocalSearchParams<{ mac?: string }>();
  return <AnalyticsScreen mac={mac} />;
}
