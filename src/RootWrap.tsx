import { Provider } from 'jotai';
import ServiceWorkerWrapper from '@sws2apps/react-sw-helper';

import { DatabaseWrapper } from '@wrapper/index';
import { handleSWOnInstalled, handleSWOnUpdated } from '@services/states/app';
import { store } from './states';
import logger from '@services/logger/index';
import App from './App';
import { can } from '@platform/index';
import '@global/global.css';
import '@global/index.css';
import '@services/firebase/index';
import '@services/i18n/index';

const RootWrap = () => {
  // the native shell ships its assets in the bundle and updates through the
  // app store, so there is no service worker to register or wait on
  if (!can('service-worker')) {
    return (
      <Provider store={store}>
        <DatabaseWrapper>
          <App updatePwa={() => {}} />
        </DatabaseWrapper>
      </Provider>
    );
  }

  return (
    <Provider store={store}>
      <ServiceWorkerWrapper
        publicServiceWorkerDest="/service-worker.js"
        onError={(err) => logger.error('app', `An error occured: ${err}`)}
        onInstalled={handleSWOnInstalled}
        onUpdated={handleSWOnUpdated}
        onWaiting={handleSWOnUpdated}
      >
        {({ update }) => (
          <DatabaseWrapper>
            <App updatePwa={update} />
          </DatabaseWrapper>
        )}
      </ServiceWorkerWrapper>
    </Provider>
  );
};

export default RootWrap;
