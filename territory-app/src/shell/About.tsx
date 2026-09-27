import { Box, Link } from '@mui/material';
import { IconLogo } from '@icons/index';
import Button from '@components/button';
import Dialog from '@components/dialog';
import Typography from '@components/typography';
import logo from '../assets/logo.svg?url';
import { version } from '../../src-tauri/tauri.conf.json';
import { t } from '../i18n';

const ORGANIZED = 'https://organized-app.com';
const GUIDE = 'https://guide.organized-app.com';

const open = (url: string) => window.open(url, '_blank', 'noopener');

const link = (href: string, text: string) => (
  <Link
    className="body-small-semibold"
    href={href}
    target="_blank"
    rel="noopener"
    onClick={(event) => {
      event.preventDefault();
      open(href);
    }}
    sx={{ color: 'var(--accent-dark)' }}
  >
    {text}
  </Link>
);

// Organized's About dialog, for this app and the app it comes from
const About = ({
  open: isOpen,
  onClose,
}: {
  open: boolean;
  onClose: VoidFunction;
}) => (
  <Dialog open={isOpen} onClose={onClose} title={t('about.title')} closable>
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}
    >
      <img src={logo} alt="" width={40} height={40} />
      <Box>
        <Typography className="h3">{t('common.appName')}</Typography>
        <Typography className="body-regular" color="var(--grey-350)">
          {t('about.version', { version })}
        </Typography>
      </Box>
    </Box>
    <Typography className="body-regular">{t('about.appText')}</Typography>

    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}
    >
      <IconLogo width={40} height={40} />
      <Typography className="h3">{t('about.partOf')}</Typography>
    </Box>
    <Typography className="body-regular">{t('about.partOfText')}</Typography>

    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignSelf: 'stretch',
      }}
    >
      <Button variant="main" onClick={() => open(ORGANIZED)}>
        {t('about.website')}
      </Button>
      <Button variant="secondary" onClick={() => open(GUIDE)}>
        {t('about.guide')}
      </Button>
    </Box>

    <Typography className="body-small-regular" color="var(--grey-350)">
      © {new Date().getFullYear()} Organized (sws2apps) |{' '}
      {link('https://sws2apps.com/privacy', t('about.privacy'))} |{' '}
      {link('https://github.com/sws2apps/organized-app', 'GitHub')}
    </Typography>
  </Dialog>
);

export default About;
