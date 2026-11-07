import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** `false` en el servidor y en la hidratación, `true` ya montado en el navegador (para portales). */
export function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
