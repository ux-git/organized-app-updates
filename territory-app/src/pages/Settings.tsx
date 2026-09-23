import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Box, Chip, IconButton, Stack } from '@mui/material';
import { useAtomValue } from 'jotai';
import { IconAdd, IconDelete } from '@icons/index';
import Button from '@components/button';
import DaySelector from '@components/day_selector';
import PageTitle from '@components/page_title';
import SwitchWithLabel from '@components/switch_with_label';
import TextField from '@components/textfield';
import TimePicker from '@components/time_picker';
import Typography from '@components/typography';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
  CardSubSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { hour24FormatState } from '@states/settings';
import { invoke, nearby } from '../native';
import { loadPeople, PEOPLE, Person, writeRows } from '../persistence';
import HallPicker from './HallPicker';
import useNearby, { Meeting, NearbyStatus } from './useNearby';

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

const Settings = () => {
  const { status, name, setName, refreshPeers, android } = useNearby();
  const hour24 = useAtomValue(hour24FormatState);
  const [params, setParams] = useSearchParams();
  const [hallOpen, setHallOpen] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [newPerson, setNewPerson] = useState('');

  const schedule = status.schedule ?? {};
  const meetings = schedule.meetings ?? [];
  const permissions = status.permissions;

  useEffect(() => {
    loadPeople().then(setPeople);
  }, []);

  // the home card's rows open their section
  useEffect(() => {
    const section = params.get('section');
    if (!section) return;
    requestAnimationFrame(() =>
      document
        .getElementById(`settings-${section}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
    setParams({}, { replace: true });
  }, [params, setParams]);

  const saveSchedule = (next: NearbyStatus['schedule']) =>
    nearby('schedule', {
      enabled: true,
      before: 45,
      after: 150,
      ...schedule,
      ...next,
    });

  const setMeeting = (index: number, change: Partial<Meeting>) =>
    saveSchedule({
      meetings: meetings.map((meeting, i) =>
        i === index ? { ...meeting, ...change } : meeting
      ),
    });

  const addPerson = async () => {
    const trimmed = newPerson.trim();
    if (!trimmed) return;
    await writeRows([
      {
        table: PEOPLE,
        id: crypto.randomUUID(),
        fields: { name: trimmed, group: false },
      },
    ]);
    setNewPerson('');
    setPeople(await loadPeople());
  };

  const removePerson = async (person: Person) => {
    await writeRows([{ table: PEOPLE, id: person.id, deleted: true }]);
    setPeople(await loadPeople());
  };

  const buttons = { display: 'flex', gap: '8px', flexWrap: 'wrap' } as const;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <PageTitle title="Settings" />

      <CardSection id="settings-phone">
        <CardSectionHeader
          title="This phone"
          description="Paired phones see this name, and it is filled in when you add a do-not-call address."
        />
        <CardSectionContent>
          <TextField
            label="Your name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => invoke('set_name', { name }).then(refreshPeers)}
          />
        </CardSectionContent>
      </CardSection>

      {android && (
        <CardSection id="settings-automatic">
          <CardSectionHeader
            title="Automatic sync"
            description="Around your meetings, this phone looks for paired phones by itself, even with the screen off."
          />
          <CardSectionContent>
            <SwitchWithLabel
              label="Sync automatically"
              helper="If Android pauses it, a notification asks you to tap once. Before you leave the meeting, it reminds you if something wasn’t sent yet."
              checked={schedule.enabled !== false}
              onChange={(enabled) => saveSchedule({ enabled })}
            />
            <Stack spacing="16px">
              <CardSubSectionHeader
                title="Meeting times"
                description="Add the days and times of your congregation meetings."
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
                    onChange={(value) =>
                      setMeeting(index, { time: toTime(value) })
                    }
                  />
                  <IconButton
                    aria-label="Remove meeting time"
                    onClick={() =>
                      saveSchedule({
                        meetings: meetings.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <IconDelete color="var(--grey-400)" />
                  </IconButton>
                </Box>
              ))}
              <Box sx={buttons}>
                <Button
                  variant="tertiary"
                  startIcon={<IconAdd />}
                  onClick={() =>
                    saveSchedule({
                      meetings: [...meetings, { day: 4, time: '19:00' }],
                    })
                  }
                >
                  Add meeting time
                </Button>
              </Box>
            </Stack>
            {permissions &&
              (!permissions.notifications || !permissions.exactAlarms) && (
                <Stack spacing="12px">
                  <CardSubSectionHeader
                    title="Permissions"
                    description="Android needs these to start the search on time and to remind you."
                  />
                  <Box sx={buttons}>
                    {!permissions.notifications && (
                      <Button
                        variant="secondary"
                        onClick={() => nearby('permissions')}
                      >
                        Allow notifications
                      </Button>
                    )}
                    {!permissions.exactAlarms && (
                      <Button
                        variant="secondary"
                        onClick={() => nearby('exactAlarms')}
                      >
                        Allow alarms
                      </Button>
                    )}
                  </Box>
                </Stack>
              )}
          </CardSectionContent>
        </CardSection>
      )}

      {android && (
        <CardSection id="settings-hall">
          <CardSectionHeader
            title="Kingdom Hall"
            description="Optional. When you arrive at the Kingdom Hall, this phone also starts looking for paired phones, even outside meeting times."
          />
          <CardSectionContent>
            <Typography className="body-regular">
              {status.hall ? 'Location saved' : 'No location saved yet'}
            </Typography>
            <Box sx={buttons}>
              <Button variant="secondary" onClick={() => setHallOpen(true)}>
                {status.hall ? 'Change on map' : 'Choose on map'}
              </Button>
              <Button
                variant="tertiary"
                onClick={() => nearby('hallHere', { radius: 150 })}
              >
                Use current location
              </Button>
              {permissions?.location && !permissions.backgroundLocation && (
                <Button
                  variant="tertiary"
                  onClick={() =>
                    nearby('permissions', { which: 'backgroundLocation' })
                  }
                >
                  Allow location all the time
                </Button>
              )}
            </Box>
          </CardSectionContent>
        </CardSection>
      )}

      <CardSection id="settings-people">
        <CardSectionHeader
          title="Publishers and groups"
          description="Territories can be assigned to these names. They are shared with your paired phones only."
        />
        <CardSectionContent>
          <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <TextField
              label="Name"
              value={newPerson}
              onChange={(event) => setNewPerson(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addPerson()}
            />
            <Button variant="secondary" onClick={addPerson}>
              Add
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {people
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((person) => (
                <Chip
                  key={person.id}
                  label={person.name}
                  onDelete={() => removePerson(person)}
                  sx={{
                    backgroundColor: 'var(--accent-150)',
                    color: 'var(--accent-dark)',
                  }}
                />
              ))}
          </Box>
        </CardSectionContent>
      </CardSection>

      <HallPicker
        open={hallOpen}
        hall={status.hall}
        onClose={() => {
          setHallOpen(false);
          nearby('status');
        }}
      />
    </Box>
  );
};

export default Settings;
