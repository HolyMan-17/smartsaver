import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { HomeScreen } from '../src/screens/HomeScreen/HomeScreen';
import { useUserStore } from '../src/store/useUserStore';

export default function AppIndex() {
  const { hasCompletedOnboarding, isLoading } = useUserStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return <HomeScreen />;
}
