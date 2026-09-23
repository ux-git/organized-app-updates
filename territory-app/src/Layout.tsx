import { Suspense } from 'react';
import {
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from 'react-router';
import { useAtomValue } from 'jotai';
import { AppBar, Box, Container, Toolbar } from '@mui/material';
import { IconNavigateLeft, IconSettings } from '@icons/index';
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
import logo from './assets/logo.svg?url';
import { ConfirmHost } from './pages/confirm';
import useSyncFeedback from './pages/sync/useSyncFeedback';

const HOME = '/';

// The main app's nav bar without its account, notifications and dashboard
// parts: the page title, back, the page's quick settings and its buttons.
const Layout = () => {
  useNavigationTrail();
  useSyncFeedback();

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const options = useAtomValue(navBarOptionsState);
  const { tablet688Up } = useBreakpoints();
  const pageWidth = usePageWidth();

  const isHome = pathname === HOME || pathname === '/welcome';

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
              {isHome && <img src={logo} alt="" width={40} height={40} />}
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
      <ConfirmHost />

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
