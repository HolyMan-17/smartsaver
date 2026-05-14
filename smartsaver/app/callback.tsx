import { Redirect } from 'expo-router';

// This route catches the Auth0 callback deep link (exp://…/--/callback).
// WebBrowser.maybeCompleteAuthSession() in _layout.tsx handles the auth
// flow, but Expo Router still processes the deep link as a route.
// We silently redirect to home so no "unmatched route" error appears.
export default function CallbackRoute() {
  return <Redirect href="/" />;
}
