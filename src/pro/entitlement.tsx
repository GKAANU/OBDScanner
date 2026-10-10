import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Product,
  type Purchase,
} from 'expo-iap';

/**
 * Otova Pro entitlement. StoreKit 2 on-device only (no receipt server):
 * the OS talks to Apple, the app never makes its own network call.
 * The last known state is cached so Pro stays unlocked offline (e.g. while
 * the phone is on the dongle's Wi-Fi, which has no internet).
 */

export const PRO_LIFETIME = 'otova.pro.lifetime';
export const PRO_YEARLY = 'otova.pro.yearly';
const PRO_SKUS = [PRO_LIFETIME, PRO_YEARLY];
const CACHE_KEY = 'otova.pro.v1';

export type ProProduct = { id: string; title: string; price: string; kind: 'lifetime' | 'yearly' };

type Ctx = {
  /** True once the cache or StoreKit answered. */
  ready: boolean;
  isPro: boolean;
  products: ProProduct[];
  /** Busy with a purchase / restore. */
  busy: boolean;
  /** Last purchase error in Turkish, or null. */
  error: string | null;
  buy: (sku: string) => Promise<void>;
  restore: () => Promise<boolean>;
  /** Development only: force Pro on/off for testing gates. */
  setDevPro: (on: boolean) => void;
};

const ProContext = createContext<Ctx | null>(null);

function isActive(p: Purchase, now: number): boolean {
  if (!PRO_SKUS.includes(p.productId)) return false;
  if (p.productId === PRO_LIFETIME) return true;
  const exp = (p as { expirationDateIOS?: number | null }).expirationDateIOS;
  return exp == null || exp > now;
}

function toProduct(p: Product): ProProduct {
  return {
    id: p.id,
    title: p.title,
    price: p.displayPrice,
    kind: p.id === PRO_LIFETIME ? 'lifetime' : 'yearly',
  };
}

function purchaseMessage(e: unknown): string | null {
  const code = (e as { code?: string })?.code;
  if (code === 'user-cancelled') return null;
  if (code === 'network-error' || code === 'service-error')
    return 'App Store\'a ulaşılamadı. Dongle\'ın Wi-Fi ağındaysan internete bağlı bir ağa geç ve tekrar dene.';
  return 'Satın alma tamamlanamadı. Biraz sonra tekrar dene.';
}

export function ProProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [storePro, setStorePro] = useState(false);
  const [devPro, setDevProState] = useState(false);
  const [products, setProducts] = useState<ProProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = useRef(false);

  const persist = useCallback((on: boolean) => {
    setStorePro(on);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ pro: on, at: Date.now() })).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
    const now = Date.now();
    persist((purchases ?? []).some((p) => isActive(p, now)));
  }, [persist]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw && alive) setStorePro(!!(JSON.parse(raw) as { pro?: boolean }).pro);
      } catch {}
      if (alive) setReady(true);
      try {
        connected.current = await initConnection();
        if (!alive || !connected.current) return;
        await refresh();
        const [inApp, subs] = await Promise.all([
          fetchProducts({ skus: [PRO_LIFETIME], type: 'in-app' }),
          fetchProducts({ skus: [PRO_YEARLY], type: 'subs' }),
        ]);
        if (!alive) return;
        const list = [...((inApp ?? []) as Product[]), ...((subs ?? []) as Product[])].map(toProduct);
        list.sort((a) => (a.kind === 'lifetime' ? -1 : 1));
        setProducts(list);
      } catch {
        // Offline or StoreKit unavailable: keep the cached state.
      }
    })();

    const updated = purchaseUpdatedListener(async (p) => {
      if (!PRO_SKUS.includes(p.productId)) return;
      try {
        await finishTransaction({ purchase: p, isConsumable: false });
      } catch {}
      persist(true);
      setBusy(false);
      setError(null);
    });
    const failed = purchaseErrorListener((e) => {
      setBusy(false);
      setError(purchaseMessage(e));
    });

    return () => {
      alive = false;
      updated.remove();
      failed.remove();
      if (connected.current) endConnection().catch(() => {});
    };
  }, [persist, refresh]);

  const buy = useCallback(async (sku: string) => {
    setError(null);
    setBusy(true);
    try {
      if (!connected.current) connected.current = await initConnection();
      if (sku === PRO_YEARLY) {
        await requestPurchase({ request: { ios: { sku } }, type: 'subs' });
      } else {
        await requestPurchase({ request: { ios: { sku } }, type: 'in-app' });
      }
      // Success arrives through purchaseUpdatedListener.
    } catch (e) {
      setBusy(false);
      setError(purchaseMessage(e));
    }
  }, []);

  const restore = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      if (!connected.current) connected.current = await initConnection();
      await restorePurchases();
      await refresh();
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      return !!raw && !!(JSON.parse(raw) as { pro?: boolean }).pro;
    } catch (e) {
      setError(purchaseMessage(e) ?? 'Geri yükleme tamamlanamadı.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const setDevPro = useCallback((on: boolean) => {
    if (__DEV__) setDevProState(on);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ready, isPro: storePro || devPro, products, busy, error, buy, restore, setDevPro }),
    [ready, storePro, devPro, products, busy, error, buy, restore, setDevPro]
  );

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro(): Ctx {
  const ctx = useContext(ProContext);
  if (!ctx) throw new Error('usePro must be used inside ProProvider');
  return ctx;
}

/** Pro feature keys, used by the paywall to highlight why it opened. */
export type ProFeature =
  | 'dtc-detail'
  | 'freeze-frame'
  | 'inspection'
  | 'live-all'
  | 'battery'
  | 'used-car'
  | 'terminal'
  | 'full-report'
  | 'pdf'
  | 'multi-vehicle'
  | 'history'
  | 'intervals'
  | 'reminders';

/**
 * `gate(feature, fn)`: runs `fn` for Pro users, otherwise opens the paywall.
 * Returns true when `fn` ran.
 */
export function useProGate(): (feature: ProFeature, fn?: () => void) => boolean {
  const { isPro } = usePro();
  const router = useRouter();
  return useCallback(
    (feature, fn) => {
      if (isPro) {
        fn?.();
        return true;
      }
      router.push({ pathname: '/pro', params: { f: feature } });
      return false;
    },
    [isPro, router]
  );
}
