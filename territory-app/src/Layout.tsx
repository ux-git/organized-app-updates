import { Suspense, useState } from 'react';
import {
  Outlet,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from 'react-router';
import { useAtomValue } from 'jotai';
import { AppBar, Box, Container, Toolbar } from '@mui/material';
import {
  IconAccount,
  IconInfo,
  IconNavigateLeft,
  IconSettings,
} from '@icons/index';
import { navBarOptionsState } from '@states/app';
import { useBreakpoints, useNavigationTrail } from '@hooks/index';
import { markLastNavBarButton } from '@layouts/navbar/markLastNavBarButton';
import AppFeedback from '@features/app_feedback';
import ThemeSwitcher from '@features/theme_switcher';
import BottomMenu from '@layouts/bottom_menu';
import IconButton from '@components/icon_button';
import PageTransition from '@components/page_transition';
import Typography from '@components/typography';
import WaitingLoader from '@components/waiting_loader';
import usePageWidth from '@layouts/usePageWidth';
import About from './shell/About';
import AccountMenu from './shell/AccountMenu';
import logo from './assets/logo.svg?url';

// decoded once up front, so the logo doesn't blink in each time Home opens
new Image().src = logo;
import { t } from './i18n';
import { ConfirmHost } from './pages/confirm';
import useNearby from './pages/useNearby';
import useSyncFeedback from './pages/sync/useSyncFeedback';

const HOME = '/';

// Organized's nav bar (layouts/navbar): the logo and the account menu on the
// dashboard, back and the page title everywhere else.
const Layout = () => {
  useNavigationTrail();
  useSyncFeedback();

  const navigate = useNavigate();
  const { pathname } = useLocation();
  const options = useAtomValue(navBarOptionsState);
  const { tablet688Up } = useBreakpoints();
  const pageWidth = usePageWidth();
  const { name } = useNearby();
  const [settingsAnimating, setSettingsAnimating] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const isWelcome = pathname === '/welcome';
  const isHome = pathname === HOME || isWelcome;

  const handleBack = () => {
    if (options.onBack) {
      options.onBack();
      return;
    }
    if (window.history.length > 1) navigate(-1);
    else navigate(HOME);
  };

  const ellipsis = {
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    maxWidth: '100%',
  } as const;

  return (
    <>
      <AppBar
        position="fixed"
        sx={{
          backgroundColor: 'var(--accent-100)',
          borderBottom: '1px solid var(--accent-200)',
          minHeight: '62px',
          overflow: 'hidden',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          boxShadow: 'none',
        }}
      >
        <Toolbar sx={{ padding: 0, minHeight: '62px', alignItems: 'center' }}>
          <Container
            maxWidth={false}
            sx={{
              maxWidth: pageWidth,
              padding: isHome
                ? { mobile: '8px 16px', tablet: '6px 32px' }
                : { mobile: '4px 16px', tablet: '6px 32px' },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {isHome ? (
              <>
                <Box
                  onClick={() => navigate(HOME)}
                  sx={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: { mobile: '8px', tablet: '16px' },
                    minWidth: 0,
                  }}
                >
                  <Box
                    component="img"
                    src={logo}
                    alt=""
                    width={40}
                    height={40}
                    // a light edge in the icon grid's colour
                    sx={{
                      borderRadius: '10px',
                      outline: '1px solid #767F92',
                      outlineOffset: '-1px',
                    }}
                  />
                  <Typography
                    className="h3"
                    sx={{ color: 'var(--black)', ...ellipsis }}
                  >
                    {t('common.appName')}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    flexShrink: 0,
                  }}
                >
                  <ThemeSwitcher
                    sx={{
                      height: '40px',
                      padding: '0 8px',
                      borderRadius: 'var(--radius-max)',
                      cursor: 'pointer',
                      transition: 'background-color 0.3s',
                      '&:hover': {
                        backgroundColor: 'var(--accent-200)',
                        '& .MuiSwitch-track': {
                          backgroundColor: 'var(--accent-300)',
                          transition: 'background-color 0.3s',
                        },
                      },
                      '& .MuiSwitch-track': {
                        transition: 'background-color 0.3s',
                      },
                    }}
                  />
                  {!isWelcome && (
                    <AccountMenu
                      name={name || t('settings.nameMissing')}
                      subtitle={t('account.thisPhone')}
                      items={[
                        {
                          icon: <IconAccount color="var(--black)" />,
                          label: t('account.profile'),
                          onClick: () => navigate('/settings/profile'),
                        },
                        {
                          icon: <IconInfo color="var(--black)" />,
                          label: t('about.title'),
                          onClick: () => setAboutOpen(true),
                        },
                      ]}
                    />
                  )}
                </Box>
              </>
            ) : (
              <>
                <Box
                  sx={{
                    display: 'flex',
                    gap: { mobile: '8px', tablet: '16px' },
                    alignItems: 'center',
                    minWidth: 0,
                    width: tablet688Up ? 'auto' : '100%',
                    justifyContent: tablet688Up ? 'start' : 'space-between',
                  }}
                >
                  <IconButton
                    className="back-arrow-button"
                    aria-label={t('common.back')}
                    onClick={handleBack}
                    sx={{
                      flexShrink: 0,
                      '&:hover': { backgroundColor: 'var(--accent-200)' },
                    }}
                  >
                    <IconNavigateLeft color="var(--black)" />
                  </IconButton>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      minWidth: 0,
                      alignItems: tablet688Up ? 'flex-start' : 'center',
                      textAlign: tablet688Up ? 'left' : 'center',
                      marginLeft: tablet688Up ? '-8px' : 0,
                    }}
                  >
                    <Typography
                      className="h3"
                      sx={{ color: 'var(--black)', ...ellipsis }}
                    >
                      {options.title}
                    </Typography>
                    {options.secondaryTitle && (
                      <Typography
                        className="label-small-regular"
                        sx={{ color: 'var(--accent-400)', ...ellipsis }}
                      >
                        {options.secondaryTitle}
                      </Typography>
                    )}
                  </Box>
                  {options.quickSettings ? (
                    <IconButton
                      aria-label={t('common.quickSettings')}
                      onClick={(e) => {
                        e.stopPropagation();
                        options.quickSettings!();
                        setSettingsAnimating(true);
                        setTimeout(() => setSettingsAnimating(false), 250);
                      }}
                      sx={{
                        marginRight: '-8px',
                        '&:hover': {
                          backgroundColor: 'var(--accent-200)',
                          '& svg': {
                            transform: settingsAnimating
                              ? 'rotate(0deg)'
                              : 'rotate(60deg)',
                          },
                        },
                        '& svg': { transition: 'transform 0.25s ease-out' },
                      }}
                    >
                      <IconSettings color="var(--black)" />
                    </IconButton>
                  ) : (
                    !tablet688Up && (
                      <Box sx={{ width: '22px', height: '22px' }} />
                    )
                  )}
                </Box>
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
              </>
            )}
          </Container>
        </Toolbar>
      </AppBar>
      {options.buttons && !tablet688Up && (
        <BottomMenu buttons={markLastNavBarButton(options.buttons)} />
      )}

      <About open={aboutOpen} onClose={() => setAboutOpen(false)} />
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
