import { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Box, Stack } from '@mui/material';
import Badge from '@components/badge';
import Radio from '@components/radio';
import SwitchWithLabel from '@components/switch_with_label';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
  CardSubSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { play } from '../../haptics';
import { nearby } from '../../native';
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
    onKeyDown={(event) => event.key === 'Enter' && onSelect()}
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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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

const MODES: { mode: SyncMode; title: string; text: string; badge?: string }[] =
  [
    {
      mode: 'always',
      title: 'Always',
      badge: 'Recommended',
      text: 'Wherever your phones meet: at the Kingdom Hall, in field service or at home. Only a phone with news sends a short signal every few minutes, so it hardly uses battery.',
    },
    {
      mode: 'location',
      title: 'At the Kingdom Hall',
      text: 'Your phone looks for paired phones only while you are at the Kingdom Hall, every minute or two.',
    },
    {
      mode: 'manual',
      title: 'Only when I tap Sync now',
      text: 'Nothing runs in the background.',
    },
  ];

/** How this phone syncs: always, at the Kingdom Hall, or by hand. */
const AutomaticSection = ({ status }: { status: NearbyStatus }) => {
  const navigate = useNavigate();
  const schedule = status.schedule ?? {};
  const mode: SyncMode = status.mode ?? 'always';
  const missing = needsForAutomatic(status).filter((need) => !need.ok);

  const save = (next: NearbyStatus['schedule']) =>
    nearby('schedule', { notify: true, ...schedule, enabled: true, ...next });

  const choose = (next: SyncMode) => {
    play(next === 'manual' ? 'remove' : 'start');
    save({
      mode: next,
      auto: next === 'manual' ? (schedule.auto ?? 'always') : next,
    });
  };

  return (
    <CardSection id="automatic">
      <CardSectionHeader
        title="How your phone syncs"
        description="Everything stays between your phones. Nothing goes over the internet."
      />
      <CardSectionContent>
        <Stack spacing="8px">
          {MODES.map((item) => (
            <Choice
              key={item.mode}
              checked={mode === item.mode}
              title={item.title}
              badge={item.badge}
              text={item.text}
              onSelect={() => choose(item.mode)}
            >
              {item.mode === 'location' && (
                <Box sx={{ paddingTop: '8px' }}>
                  <Typography className="body-small-semibold">
                    {status.hall
                      ? status.inside
                        ? 'You are at the Kingdom Hall now.'
                        : 'Kingdom Hall location saved.'
                      : 'Choose where the Kingdom Hall is first.'}
                  </Typography>
                  <Box sx={{ paddingTop: '8px' }}>
                    <Actions
                      actions={[
                        {
                          label: status.hall
                            ? 'Change location'
                            : 'Choose location',
                          kind: status.hall ? 'secondary' : 'main',
                          onClick: () => navigate('/settings/hall'),
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
              title="Your phone still has to allow"
              description="Without these, your phone can’t sync by itself."
            />
            {missing.map((need) => (
              <NeedRow
                key={need.key}
                title={need.title}
                text={need.text}
                action={
                  <Actions
                    actions={[
                      { label: need.label, kind: 'main', onClick: need.fix },
                    ]}
                  />
                }
              />
            ))}
          </Stack>
        )}

        <SwitchWithLabel
          label="Tell me what a sync brought"
          helper="Which territories changed and with whom. A sync that brings nothing new stays silent."
          checked={schedule.notify !== false}
          onChange={(notify) => save({ notify })}
        />
      </CardSectionContent>
    </CardSection>
  );
};

export default AutomaticSection;
