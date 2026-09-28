import { ReactNode } from 'react';
import { Box, Stack } from '@mui/material';
import Badge from '@components/badge';
import Button from '@components/button';
import Radio from '@components/radio';
import SwitchWithLabel from '@components/switch_with_label';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
  CardSubSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { play, toggled } from '../../haptics';
import { nearby } from '../../native';
import { t } from '../../i18n';
import { needsForAutomatic } from '../permissions';
import { NearbyStatus, SyncMode } from '../useNearby';
import { Actions } from './parts';

const Choice = ({
  checked,
  title,
  text,
  badge,
  onSelect,
  children,
}: {
  checked: boolean;
  title: string;
  text: string;
  badge?: string;
  onSelect: VoidFunction;
  children?: ReactNode;
}) => (
  <Box
    role="radio"
    aria-checked={checked}
    tabIndex={0}
    onClick={onSelect}
    onKeyDown={(event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onSelect();
    }}
    sx={{
      display: 'flex',
      gap: '8px',
      padding: '12px',
      borderRadius: 'var(--radius-l)',
      cursor: 'pointer',
      border: checked
        ? '1px solid var(--accent-main)'
        : '1px solid var(--accent-200)',
      backgroundColor: checked ? 'var(--accent-100)' : 'var(--white)',
    }}
  >
    <Radio checked={checked} tabIndex={-1} />
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Typography className="h4">{title}</Typography>
        {badge && <Badge text={badge} color="accent" size="small" filled />}
      </Box>
      <Typography className="body-small-regular" color="var(--grey-400)">
        {text}
      </Typography>
      {checked && children}
    </Box>
  </Box>
);

/** One thing Android has to allow: allowed, or a button to allow it. */
const NeedRow = ({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action: ReactNode;
}) => (
  <Box sx={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography className="body-regular">{title}</Typography>
      <Typography className="body-small-regular" color="var(--grey-400)">
        {text}
      </Typography>
    </Box>
    {action}
  </Box>
);

const MODES: { mode: SyncMode; key: string; recommended?: boolean }[] = [
  { mode: 'always', key: 'always', recommended: true },
  { mode: 'location', key: 'hall' },
  { mode: 'manual', key: 'manual' },
];

const AUTOMATIONS = ['arrive', 'timeOfDay', 'nfc'];

/**
 * Two iPhones only find each other with one app open. A Shortcuts
 * automation runs "Sync territories" (the app's App Intent) by itself, with
 * the app closed. Each person sets it up once; an app can't do it for them.
 */
const ShortcutsGuide = () => (
  <Stack spacing="12px">
    <CardSubSectionHeader
      title={t('automatic.shortcuts')}
      description={t('automatic.shortcutsText')}
    />
    <Typography className="body-small-regular">
      {t('automatic.shortcutsSteps')}
    </Typography>
    <Stack spacing="8px">
      {AUTOMATIONS.map((trigger) => (
        <Box key={trigger}>
          <Typography className="body-small-semibold">
            {t(`automatic.${trigger}`)}
          </Typography>
          <Typography className="body-small-regular" color="var(--grey-400)">
            {t(`automatic.${trigger}Text`)}
          </Typography>
        </Box>
      ))}
    </Stack>
    <Actions
      actions={[
        {
          label: t('automatic.openShortcuts'),
          onClick: () => nearby('shortcuts'),
        },
      ]}
    />
  </Stack>
);

/** How this phone syncs: always, at the Kingdom Hall, or by hand. */
const AutomaticSection = ({ status }: { status: NearbyStatus }) => {
  const schedule = status.schedule ?? {};
  const mode: SyncMode = status.mode ?? 'always';
  const missing = needsForAutomatic(status).filter((need) => !need.ok);

  const save = (next: NearbyStatus['schedule']) =>
    nearby('schedule', { notify: true, ...schedule, enabled: true, ...next });

  const choose = (next: SyncMode) => {
    if (next !== mode) play('select');
    save({
      mode: next,
      auto: next === 'manual' ? (schedule.auto ?? 'always') : next,
    });
  };

  return (
    <CardSection id="automatic">
      <CardSectionHeader
        title={t('automatic.title')}
        description={t('automatic.text')}
      />
      <CardSectionContent>
        <Stack
          spacing="8px"
          role="radiogroup"
          aria-label={t('automatic.title')}
        >
          {MODES.map((item) => (
            <Choice
              key={item.mode}
              checked={mode === item.mode}
              title={t(`automatic.${item.key}`)}
              badge={item.recommended ? t('common.recommended') : undefined}
              text={t(`automatic.${item.key}Text`)}
              onSelect={() => choose(item.mode)}
            >
              {item.mode === 'location' && (
                <Box sx={{ paddingTop: '8px' }}>
                  <Typography className="body-small-semibold">
                    {status.hall
                      ? status.inside
                        ? t('automatic.atHall')
                        : t('automatic.hallSaved')
                      : t('automatic.hallFirst')}
                  </Typography>
                  <Box sx={{ paddingTop: '8px' }}>
                    <Actions
                      actions={[
                        {
                          label: status.hall
                            ? t('automatic.changeLocation')
                            : t('automatic.chooseLocation'),
                          kind: status.hall ? 'secondary' : 'main',
                          onClick: () =>
                            document.getElementById('hall')?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            }),
                        },
                      ]}
                    />
                  </Box>
                </Box>
              )}
            </Choice>
          ))}
        </Stack>

        {missing.length > 0 && (
          <Stack spacing="16px">
            <CardSubSectionHeader
              title={t('automatic.missing')}
              description={t('automatic.missingText')}
            />
            {missing.map((need) => (
              <NeedRow
                key={need.key}
                title={need.title}
                text={need.text}
                action={
                  <Button
                    variant="small"
                    disableAutoStretch
                    onClick={need.fix}
                    sx={{ flexShrink: 0 }}
                  >
                    {need.label}
                  </Button>
                }
              />
            ))}
          </Stack>
        )}

        <SwitchWithLabel
          label={t('automatic.notify')}
          helper={t('automatic.notifyText')}
          checked={schedule.notify !== false}
          onChange={(notify) => save({ notify: toggled(notify) })}
        />

        {status.platform === 'ios' && <ShortcutsGuide />}
      </CardSectionContent>
    </CardSection>
  );
};

export default AutomaticSection;
