export const notificationService = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  },

  getPermissionState(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  },

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (err) {
      console.warn('Error requesting notification permission', err);
      return 'default';
    }
  },

  async sendNotification(title: string, body: string, icon?: string): Promise<boolean> {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      return false;
    }
    try {
      // 1. Try sending via service worker registration first (most robust, works in background/minimized/mobile)
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if (registration && 'showNotification' in registration) {
          await registration.showNotification(title, {
            body,
            icon: icon || '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'mvp-ledger-notification',
            renotify: true,
            vibrate: [100, 50, 100],
            data: {
              dateOfArrival: Date.now(),
              primaryKey: 1
            }
          } as any);
          return true;
        }
      }
      
      // 2. Fallback to standard window Notification if service worker is not ready or unsupported
      new Notification(title, {
        body,
        icon: icon || '/icon-192.png'
      });
      return true;
    } catch (err) {
      console.warn('Error sending browser notification', err);
      return false;
    }
  }
};
