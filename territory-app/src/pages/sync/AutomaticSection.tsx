import { ReactNode } from 'react';
import { Box, IconButton, Stack } from '@mui/material';
import { useAtomValue } from 'jotai';
import { IconAdd, IconDelete } from '@icons/index';
import Badge from '@components/badge';
import Button from '@components/button';
import DaySelector from '@components/day_selector';
import Radio from '@components/radio';
import SwitchWithLabel from '@components/switch_with_label';
import TimePicker from '@components/time_picker';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
  CardSubSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { hour24FormatState } from '@states/settings';
import { play } from '../../haptics';
import { nearby } from '../../native';
import { needsForAutomatic } from '../permissions';
import { Meeting, NearbyStatus, SyncMode } from '../useNearby';

const toDate = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
};

const toTime = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

// the day selector counts from Monday, the schedule from Sunday
const toSelector = (day: number) => (day + 6) % 7;
const fromSelector = (value: number) => (value + 1) % 7;

const Choice = ({
  checked,
  title,
  text,
  badge,
  onSelect,
}: {
  checked: boolean;
  title: string;
  text: string;
  badge?: string;
  onSelect: VoidFunction;
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

/** How and when this phone syncs by itself, on the Sync page. */
const AutomaticSection = ({ status }: { status: NearbyStatus }) => {
  const hour24 = useAtomValue(hour24FormatState);

  const schedule = status.schedule ?? {};
  const enabled = schedule.enabled !== false;
  const mode: SyncMode = schedule.mode ?? 'always';
  const meetings = schedule.meetings ?? [];
  const missing = needsForAutomatic(status).filter((need) => !need.ok);

  const save = (next: NearbyStatus['schedule']) =>
    nearby('schedule', {
      enabled: true,
      mode: 'always',
      notify: true,
      before: 45,
      after: 150,
      ...schedule,
      ...next,
    });

  const setMeeting = (index: number, change: Partial<Meeting>) =>
    save({
      meetings: meetings.map((meeting, i) =>
        i === index ? { ...meeting, ...change } : meeting
      ),
    });

  return (
    <CardSection id="automatic">
      <CardSectionHeader
        title="Automatic sync"
        description="Your phone syncs with paired phones by itself, also with the screen off and the app closed."
      />
      <CardSectionContent>
        <SwitchWithLabel
          label="Sync automatically"
          checked={enabled}
          onChange={(value) => {
            play(value ? 'start' : 'remove');
            save({ enabled: value });
          }}
        />

        {enabled && missing.length > 0 && (
          <Stack spacing="16px">
            <CardSubSectionHeader
              title="Android still has to allow"
              description="Without these, the sync can’t run by itself."
            />
            {missing.map((need) => (
              <NeedRow
                key={need.key}
                title={need.title}
                text={need.text}
                action={
                  <Button
                    variant="secondary"
                    disableAutoStretch
                    onClick={need.fix}
                  >
                    {need.label}
                  </Button>
                }
              />
            ))}
          </Stack>
        )}

        {enabled && (
          <Stack spacing="8px">
            <CardSubSectionHeader title="When" />
            <Choice
              checked={mode === 'always'}
              title="All the time"
              badge="Recommended"
              text="Whenever your phones are close: at the Kingdom Hall, in field service or at home. Uses about as much battery as a smartwatch."
              onSelect={() => save({ mode: 'always' })}
            />
            <Choice
              checked={mode === 'meetings'}
              title="Only around meetings"
              text="From 45 minutes before each meeting until 2½ hours after it starts, and for a few minutes after you open the app or change something."
              onSelect={() => save({ mode: 'meetings' })}
            />
          </Stack>
        )}

        <SwitchWithLabel
          label="Tell me when a sync is done"
          helper="With whom, what came in, and when. When a paired phone is close but your phones haven’t synced, you get a Sync now button."
          checked={schedule.notify !== false}
          onChange={(notify) => save({ notify })}
        />

        <Stack spacing="16px">
          <CardSubSectionHeader
            title="Meeting times"
            description={
              mode === 'meetings'
                ? 'Your phone looks for paired phones around these times.'
                : 'Before you leave a meeting, you get a reminder if your changes haven’t reached a paired phone yet.'
            }
          />
          {meetings.map((meeting: Meeting, index: number) => (
            <Box
              key={index}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <DaySelector
                label="Day"
                value={toSelector(meeting.day)}
                onChange={(value) =>
                  setMeeting(index, { day: fromSelector(value) })
                }
              />
              <TimePicker
                label="Start time"
                ampm={!hour24}
                value={toDate(meeting.time)}
                onChange={(value) => setMeeting(index, { time: toTime(value) })}
              />
              <IconButton
                aria-label="Remove meeting time"
                onClick={() => {
                  play('remove');
                  save({ meetings: meetings.filter((_, i) => i !== index) });
                }}
              >
                <IconDelete color="var(--red-main)" />
              </IconButton>
            </Box>
          ))}
          <Box>
            <Button
              variant="tertiary"
              startIcon={<IconAdd />}
              disableAutoStretch
              onClick={() =>
                save({ meetings: [...meetings, { day: 4, time: '19:00' }] })
              }
            >
              Add meeting time
            </Button>
          </Box>
        </Stack>
      </CardSectionContent>
    </CardSection>
  );
};

export default AutomaticSection;
