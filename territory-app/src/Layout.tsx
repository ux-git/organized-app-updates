import { Suspense, useEffect, useState } from 'react';
import {
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from 'react-router';
import { useAtomValue } from 'jotai';
import { AppBar, Badge, Box, Container, Toolbar } from '@mui/material';
import { IconNavigateLeft, IconSettings, IconSync } from '@icons/index';
import { navBarOptionsState } from '@states/app';
import { useBreakpoints, useNavigationTrail } from '@hooks/index';
import { markLastNavBarButton } from '@layouts/navbar/markLastNavBarButton';
import AppFeedback from '@features/app_feedback';
import BottomMenu from '@layouts/bottom_menu';
import IconButton from '@components/icon_button';
import PageTransition from '@components/page_transition';
import Typography from '@components/typography';
import WaitingLoader from '@components/waiting_loader';
import usePageWidth from '@layouts/usePageWidth';
import { invoke, isNative, listen } from './native';

const HOME = '/territories';

/** Changes a paired phone hasn't received yet, shown on the sync button. */
const useUnsynced = () => {
  const [count, setCount] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!isNative()) return;
    const refresh = () =>
      invoke<{ unsynced: number }>('identity')
        .then((identity) => setCount(identity.unsynced))
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 5000);
    const stop = listen('store-changed', refresh);
    return () => {
      clearInterval(timer);
      stop.then((unlisten) => unlisten());
    };
  }, [pathname]);

  return count;
};

// The main app's nav bar without its account, notifications and dashboard
// parts: the page title, back, the page's quick settings and its buttons.
const Layout = () => {
  useNavigationTrail();

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const options = useAtomValue(navBarOptionsState);
  const { tablet688Up } = useBreakpoints();
  const pageWidth = usePageWidth();
  const unsynced = useUnsynced();

  const isHome = pathname === HOME;

  const handleBack = () => {
    if (options.onBack) {
      options.onBack();
      return;
    }
    if (window.history.length > 1) navigate(-1);
    else navigate(HOME);
  };

  return (
    <>
      <AppBar
        position="fixed"
        sx={{
          backgroundColor: 'var(--accent-100)',
          borderBottom: '1px solid var(--accent-200)',
          minHeight: '62px',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          boxShadow: 'none',
        }}
      >
        <Toolbar sx={{ padding: 0, minHeight: '62px' }}>
          <Container
            maxWidth={false}
            sx={{
              maxWidth: pageWidth,
              padding: { mobile: '4px 16px', tablet: '6px 32px' },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: 0,
                flex: 1,
              }}
            >
              {!isHome && (
                <IconButton
                  className="back-arrow-button"
                  aria-label="Back"
                  onClick={handleBack}
                  sx={{ flexShrink: 0 }}
                >
                  <IconNavigateLeft color="var(--black)" />
                </IconButton>
              )}
              <Box
                sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
              >
                <Typography
                  className="h3"
                  sx={{
                    color: 'var(--black)',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                  }}
                >
                  {options.title ?? 'Territories'}
                </Typography>
                {options.secondaryTitle && (
                  <Typography
                    className="label-small-regular"
                    sx={{ color: 'var(--accent-400)' }}
                  >
                    {options.secondaryTitle}
                  </Typography>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {options.quickSettings && (
                <IconButton
                  aria-label="Quick settings"
                  onClick={(e) => {
                    e.stopPropagation();
                    options.quickSettings!();
                  }}
                >
                  <IconSettings color="var(--black)" />
                </IconButton>
              )}
              {isHome && (
                <IconButton
                  aria-label="Sync"
                  onClick={() => navigate('/nearby')}
                >
                  <Badge
                    badgeContent={unsynced}
                    color="primary"
                    max={99}
                    sx={{
                      '& .MuiBadge-badge': {
                        backgroundColor: 'var(--accent-main)',
                        color: 'var(--always-white)',
                      },
                    }}
                  >
                    <IconSync color="var(--black)" />
                  </Badge>
                </IconButton>
              )}
              {tablet688Up && options.buttons && (
                <Box
                  sx={{
                    display: 'flex',
                    gap: '4px',
                    padding: '4px',
                    backgroundColor: 'var(--accent-150)',
                    borderRadius: 'var(--radius-xl)',
                  }}
                >
                  {markLastNavBarButton(options.buttons)}
                </Box>
              )}
            </Box>
          </Container>
        </Toolbar>
      </AppBar>
      {options.buttons && !tablet688Up && (
        <BottomMenu buttons={markLastNavBarButton(options.buttons)} />
      )}

      <AppFeedback />

      <Toolbar sx={{ padding: 0, minHeight: '62px' }} />

      <Container
        maxWidth={false}
        sx={{
          maxWidth: pageWidth,
          width: '100%',
          paddingInline: 'var(--page-padding)',
          marginTop: '24px',
        }}
      >
        <Suspense fallback={<WaitingLoader type="lottie" />}>
          <Box sx={{ marginBottom: '32px' }}>
            <PageTransition>
              <Outlet />
            </PageTransition>
          </Box>
        </Suspense>
      </Container>

      <ScrollRestoration />
    </>
  );
};

export default Layout;
