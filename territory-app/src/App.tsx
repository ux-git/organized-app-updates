import { lazy, useEffect, useState } from 'react';
import {
  createHashRouter,
  Navigate,
  RouterProvider,
  useLocation,
} from 'react-router';
import { Provider, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { CssBaseline, Stack, ThemeProvider } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { deDE } from '@mui/x-date-pickers/locales';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { appLocaleState, appThemeState } from '@states/app';
import { store } from '@states/index';
import Button from '@components/button';
import Typography from '@components/typography';
import WaitingLoader from '@components/waiting_loader';
import { t } from './i18n';
import { isNative } from './native';
import { load, persist } from './persistence';
import Layout from './Layout';
import '@global/global.css';
import '@global/index.css';

const Territories = lazy(() => import('@pages/territories/hub'));
const TerritoryDetails = lazy(() => import('@pages/territories/details'));
const TerritoryStatistics = lazy(() => import('@pages/territories/statistics'));
const TerritoryHistory = lazy(() => import('@pages/territories/history'));
const TerritoryMapPage = lazy(() => import('@pages/territories/map'));
const TerritoryDoNotCalls = lazy(
  () => import('@pages/territories/do_not_calls')
);
const Home = lazy(() => import('./pages/Home'));
const Settings = lazy(() => import('./pages/Settings'));

// notifications, launcher shortcuts and reminders from 0.2 (/nearby) open
// the sync page by its old addresses
const SyncLink = () => {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (params.get('section') === 'automatic') {
    return <Navigate to="/settings/automatic" replace />;
  }
  return <Navigate to={{ pathname: '/settings/sync', search }} replace />;
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
      { path: '/settings/:tab?', element: <Settings /> },
      { path: '/settings/publishers/:publisherId', element: <Settings /> },
      {
        path: '/settings/hall',
        element: <Navigate to="/settings/automatic" replace />,
      },
      {
        path: '/publishers',
        element: <Navigate to="/settings/publishers" replace />,
      },
      { path: '/sync', element: <SyncLink /> },
      { path: '/nearby', element: <SyncLink /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const Themed = () => {
  const theme = useAtomValue(appThemeState);
  const locale = useAtomValue(appLocaleState);
  const { i18n } = useTranslation();
  const [ready, setReady] = useState(!isNative());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isNative()) return;
    let stop: (() => void) | undefined;
    let gone = false;
    setFailed(false);
    load()
      .then(() => {
        // StrictMode mounts twice; only the mount that stays persists
        if (!gone) stop = persist();
        setReady(true);
      })
      .catch((error) => {
        // nothing is saved over data that couldn't be read
        console.error('territories: loading failed', error);
        setFailed(true);
      });
    return () => {
      gone = true;
      stop?.();
    };
  }, [attempt]);

  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider
        dateAdapter={AdapterDateFns}
        adapterLocale={locale}
        localeText={
          i18n.language === 'deu'
            ? deDE.components.MuiLocalizationProvider.defaultProps.localeText
            : undefined
        }
      >
        <CssBaseline />
        <CacheProvider value={cache}>
          {ready ? (
            // every page takes up a new language at once
            <RouterProvider key={i18n.language} router={router} />
          ) : failed ? (
            <Stack
              spacing="16px"
              sx={{
                minHeight: '100vh',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
              }}
            >
              <Typography className="h2">{t('boot.failed')}</Typography>
              <Typography className="body-regular" color="var(--grey-400)">
                {t('boot.failedText')}
              </Typography>
              <Button
                variant="main"
                disableAutoStretch
                onClick={() => setAttempt((count) => count + 1)}
              >
                {t('common.tryAgain')}
              </Button>
            </Stack>
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
