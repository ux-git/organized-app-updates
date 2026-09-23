import { lazy, useEffect, useState } from 'react';
import {
  createHashRouter,
  Navigate,
  RouterProvider,
  useLocation,
} from 'react-router';
import { Provider, useAtomValue } from 'jotai';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { appLocaleState, appThemeState } from '@states/app';
import { store } from '@states/index';
import WaitingLoader from '@components/waiting_loader';
import { isNative } from './native';
import { load, persist } from './persistence';
import Layout from './Layout';
import '@global/global.css';
import '@global/index.css';
import '@services/i18n/index';

const Territories = lazy(() => import('@pages/territories/hub'));
const TerritoryDetails = lazy(() => import('@pages/territories/details'));
const TerritoryStatistics = lazy(() => import('@pages/territories/statistics'));
const TerritoryHistory = lazy(() => import('@pages/territories/history'));
const TerritoryMapPage = lazy(() => import('@pages/territories/map'));
const TerritoryDoNotCalls = lazy(
  () => import('@pages/territories/do_not_calls')
);
const Home = lazy(() => import('./pages/Home'));
const Welcome = lazy(() => import('./pages/Welcome'));
const KingdomHall = lazy(() => import('./pages/KingdomHall'));
const Sync = lazy(() => import('./pages/Sync'));
const Publishers = lazy(() => import('./pages/Publishers'));

// reminders and shortcuts from 0.2 open /nearby
const OldSettingsLink = () => {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/sync', search }} replace />;
};

const cache = createCache({ key: 'css', prepend: true });

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: '/territories', element: <Territories /> },
      { path: '/territories/history', element: <TerritoryHistory /> },
      { path: '/territories/history/:id', element: <TerritoryHistory /> },
      { path: '/territories/statistics', element: <TerritoryStatistics /> },
      { path: '/territories/map', element: <TerritoryMapPage /> },
      { path: '/territories/do-not-calls', element: <TerritoryDoNotCalls /> },
      { path: '/territories/:id', element: <TerritoryDetails /> },
      { path: '/welcome', element: <Welcome /> },
      {
        path: '/settings/automatic',
        element: <Navigate to="/sync?section=automatic" replace />,
      },
      { path: '/settings/hall', element: <KingdomHall /> },
      {
        path: '/settings',
        element: <Navigate to="/sync?section=automatic" replace />,
      },
      { path: '/sync', element: <Sync /> },
      { path: '/publishers', element: <Publishers /> },
      { path: '/nearby', element: <OldSettingsLink /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const Themed = () => {
  const theme = useAtomValue(appThemeState);
  const locale = useAtomValue(appLocaleState);
  const [ready, setReady] = useState(!isNative());

  useEffect(() => {
    if (!isNative()) return;
    let stop: (() => void) | undefined;
    load()
      .then(() => persist())
      .then((unlisten) => {
        stop = unlisten;
        setReady(true);
      })
      .catch((error) => {
        console.error('territories: loading failed', error);
        setReady(true);
      });
    return () => stop?.();
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locale}>
        <CssBaseline />
        <CacheProvider value={cache}>
          {ready ? (
            <RouterProvider router={router} />
          ) : (
            <WaitingLoader type="lottie" />
          )}
        </CacheProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
};

const App = () => (
  <Provider store={store}>
    <Themed />
  </Provider>
);

export default App;
