/**
 * Native Haptic Feedback Utility using Web Vibration API
 * Provides tactile feedback for native app feel on supported mobile devices
 */

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

export function triggerHapticFeedback(pattern: HapticPattern = 'light'): void {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (pattern) {
      case 'selection':
      case 'light':
        navigator.vibrate(8);
        break;
      case 'medium':
        navigator.vibrate(15);
        break;
      case 'heavy':
        navigator.vibrate(25);
        break;
      case 'success':
        navigator.vibrate([10, 30, 15]);
        break;
      case 'warning':
        navigator.vibrate([15, 40, 15]);
        break;
      case 'error':
        navigator.vibrate([30, 50, 30, 50, 30]);
        break;
      default:
        navigator.vibrate(10);
    }
  } catch {
    // Vibration API may throw or be restricted on non-gesture calls
  }
}
