import { ReactNode } from 'react';
import { Box, IconButton, Stack } from '@mui/material';
import { useAtomValue } from 'jotai';
import { IconAdd, IconCheckCircle, IconDelete } from '@icons/index';
import Badge from '@components/badge';
import Button from '@components/button';
import DaySelector from '@components/day_selector';
import PageTitle from '@components/page_title';
import Radio from '@components/radio';
import SwitchWithLabel from '@components/switch_with_label';
import TimePicker from '@components/time_picker';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { hour24FormatState } from '@states/settings';
import { play } from '../haptics';
import { nearby } from '../native';
import { needsForAutomatic } from './permissions';
import useNearby, { Meeting, NearbyStatus, SyncMode } from './useNearby';

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

const AutomaticSync = () => {
  const { status } = useNearby();
  const hour24 = useAtomValue(hour24FormatState);

  const schedule = status.schedule ?? {};
  const enabled = schedule.enabled !== false;
  const mode: SyncMode = schedule.mode ?? 'always';
  const meetings = schedule.meetings ?? [];
  const needs = needsForAutomatic(status);

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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle title="Automatic sync" />

      <CardSection>
        <CardSectionHeader
          title="Automatic sync"
          description="Your phone syncs with paired phones by itself, also with the screen off and the app closed. Nothing ever goes over the internet."
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
          {enabled && (
            <Stack spacing="8px">
              <Choice
                checked={mode === 'always'}
                title="All the time"
                badge="Recommended"
                text="Your phones sync whenever they are close: at the Kingdom Hall, in field service or at home. It uses about as much battery as a smartwatch connection."
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
        </CardSectionContent>
      </CardSection>

      {enabled && needs.length > 0 && (
        <CardSection>
          <CardSectionHeader
            title={
              needs.every((need) => need.ok)
                ? 'Everything is allowed'
                : 'What Android has to allow'
            }
            description="Allow these once, and the sync runs by itself from then on."
          />
          <Stack spacing="16px">
            {needs.map((need) => (
              <NeedRow
                key={need.key}
                title={need.title}
                text={need.text}
                action={
                  need.ok ? (
                    <IconCheckCircle color="var(--green-main)" />
                  ) : (
                    <Button
                      variant="secondary"
                      disableAutoStretch
                      onClick={need.fix}
                    >
                      {need.label}
                    </Button>
                  )
                }
              />
            ))}
          </Stack>
        </CardSection>
      )}

      <CardSection>
        <CardSectionHeader
          title="Notifications"
          description="A sync happens quietly. These tell you it did."
        />
        <CardSectionContent>
          <SwitchWithLabel
            label="Tell me when a sync is done"
            helper="With whom, what came in, and when. When a paired phone is close but your phones haven’t synced, you also get a Sync now button."
            checked={schedule.notify !== false}
            onChange={(notify) => save({ notify })}
          />
        </CardSectionContent>
      </CardSection>

      <CardSection>
        <CardSectionHeader
          title="Meeting times"
          description={
            mode === 'meetings'
              ? 'Your phone looks for paired phones around these times.'
              : 'Before you leave a meeting, you get a reminder if your changes haven’t reached a paired phone yet.'
          }
        />
        <Stack spacing="16px">
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
      </CardSection>
    </Box>
  );
};

export default AutomaticSync;
