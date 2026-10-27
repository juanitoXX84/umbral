import { requireOptionalNativeModule } from "expo-modules-core";

type PreferencesModule = {
  getPreferencesAsync?: () => Promise<Record<string, unknown>>;
  setPreferencesAsync?: (preferences: Record<string, unknown>) => Promise<void>;
};

type MenuModule = {
  hideMenu?: () => void;
  closeMenu?: () => void;
};

const preferences = requireOptionalNativeModule<PreferencesModule>("DevMenuPreferences");
const menu = requireOptionalNativeModule<MenuModule>("ExpoDevMenu");

export function quietDevMenu() {
  const current = preferences?.getPreferencesAsync?.();
  Promise.resolve(current)
    .then((saved) =>
      preferences?.setPreferencesAsync?.({
        ...(saved ?? {}),
        motionGestureEnabled: false,
      })
    )
    .catch(() => {});
}

let lastDismiss = 0;

export function dismissDevMenu() {
  const now = Date.now();
  if (now - lastDismiss < 800) return;
  lastDismiss = now;
  try {
    menu?.closeMenu?.();
    menu?.hideMenu?.();
  } catch {
    // Expo Go keeps its own menu when it does not expose a close method.
  }
}
