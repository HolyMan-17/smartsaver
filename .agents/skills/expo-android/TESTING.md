# Testing (React Native)

There's often no test setup in Expo starter projects. Add one once the app grows beyond a prototype.

## Setup (Jest + React Native Testing Library)

```bash
npx expo install jest-expo jest @testing-library/react-native @testing-library/jest-native
```

`package.json`:
```jsonc
"scripts": { "test": "jest" },
"jest": { "preset": "jest-expo", "setupFiles": ["<rootDir>/jest.setup.ts"] }
```

`jest.setup.ts`:
```ts
import '@testing-library/jest-native/extend-expect';
```

Extend `transformIgnorePatterns` only for packages that ship untranspiled ESM (most `expo-*` and `react-native-*` are handled by `jest-expo`).

## What to test

- **Unit**: pure utils, reducers, Zustand store actions/selectors, Zod schemas, mapping functions.
- **Component**: presentational components with RNTL — render, `fireEvent`, `findByText`. Assert on **behavior** (what the user sees), not implementation.
- **Screen/integration**: mock the service layer (`jest.mock('@/src/services/...')`) and assert the screen orchestrates state + navigation correctly.
- **Avoid** mocking React Native internals or `StyleSheet`. Mock network and storage, not the platform.

## Patterns

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Toggle } from './Toggle';

it('calls onToggle when pressed', () => {
  const onToggle = jest.fn();
  render(<Toggle on={false} onToggle={onToggle} />);
  fireEvent.press(screen.getByRole('button'));
  expect(onToggle).toHaveBeenCalledTimes(1);
});
```

- Query by role/label/text first; reserve `testID` for cases where role/label aren't available.
- Use `findBy*` (awaitable) for async updates; `getBy*` for synchronous (throws if missing).
- Mock `expo-secure-store`, `expo-notifications`, and `expo-router` (`useRouter`, `usePathname`) in screen tests.

## E2E

- **Maestro** (recommended for RN): write `maestro/login.yaml` flows; runs on emulator/device. Fast, no instrumentation. Great for critical paths.
- **Detox**: compiled into the binary; more setup, very fast on device. Use for large suites.
- Keep E2E thin: critical paths only (login → see device → toggle → log out). Flaky E2E erodes trust — fix or delete flaky tests immediately.

## When to write tests

- New bug → regression test first.
- Shared components with branching logic.
- Store actions with state transitions.
- Mappers between API payloads and UI shapes — these catch naming drift, especially when the backend uses a different language convention (e.g., Spanish field names).
- Skip tests for one-off layout tweaks and pure styling.
