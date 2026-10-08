import { registerMapLocator, type MapPosition } from '@services/maps/location';
import { hasNearby, isMac, listen, nearby } from './native';

if (isMac() && hasNearby())
  registerMapLocator(
    () =>
      new Promise<MapPosition>((resolve, reject) => {
        const id = crypto.randomUUID();
        let stop: (() => void) | undefined;
        let finished = false;
        const finish = (result?: MapPosition, error?: string) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          stop?.();
          if (result) resolve(result);
          else reject(new Error(error ?? 'Location unavailable'));
        };
        const timer = setTimeout(
          () => finish(undefined, 'Location timed out'),
          65000
        );
        listen<{
          id: string;
          latitude?: number;
          longitude?: number;
          error?: string;
        }>('location-result', (result) => {
          if (result.id !== id) return;
          if (
            typeof result.latitude === 'number' &&
            typeof result.longitude === 'number'
          )
            finish({ latitude: result.latitude, longitude: result.longitude });
          else finish(undefined, result.error);
        })
          .then((unlisten) => {
            stop = unlisten;
            if (finished) {
              stop();
              return;
            }
            nearby('locate', { id });
          })
          .catch((error) => finish(undefined, String(error)));
      })
  );
