import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Stack } from '@mui/material';
import { Button, Select, Typography } from '@components/index';
import MenuItem from '@components/menuitem';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import PublisherSearch from '@features/territories/components/publisher_search';
import { tx } from '@services/i18n/translation';
import { territoriesState } from '@states/territories';
import { Person } from '../persistence';
import { activeFor, Resolution } from '../publisherChanges';
import { linkedDevices, linksState } from '../profiles';
import { removeWithUndo } from './usePeople';

const ManagePublisher = ({
  person,
  people,
  onClose,
  initialMode = 'remove',
}: {
  person: Person;
  people: Person[];
  onClose: VoidFunction;
  initialMode?: 'remove' | 'merge';
}) => {
  const territories = useAtomValue(territoriesState);
  const links = useAtomValue(linksState);
  const held = territories.filter(
    (item) => activeFor(item, person.name).length
  );
  const options = people.filter((item) => item.id !== person.id);
  const [mode, setMode] = useState(initialMode);
  const [target, setTarget] = useState<Person | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(
    {}
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (id: string, value: Resolution) =>
    setResolutions((previous) => ({ ...previous, [id]: value }));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await removeWithUndo(person, {
        mergeInto: mode === 'merge' ? (target ?? undefined) : undefined,
        resolutions,
      });
      onClose();
    } catch (error) {
      setError(tx((error as Error).message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={person.name}
      description={tx('Assignment history is always kept.')}
    >
      <Select
        label={tx('Action')}
        value={mode}
        onChange={(event) => setMode(event.target.value as 'remove' | 'merge')}
      >
        <MenuItem value="remove">{tx('Remove publisher')}</MenuItem>
        <MenuItem value="merge">{tx('Merge duplicate')}</MenuItem>
      </Select>
      {mode === 'merge' ? (
        <>
          <PublisherSearch
            options={options.filter((item) => item.group === person.group)}
            value={target}
            onChange={setTarget}
            getName={(item) => item.name}
            label={tx('Keep this publisher')}
          />
          <Typography>
            {tx(
              'Move all assignments and linked profiles to this publisher. History is kept.'
            )}
          </Typography>
        </>
      ) : (
        <>
          {held.map((territory) => {
            const choice = resolutions[territory.id];
            return (
              <Stack key={territory.id} spacing="8px">
                <Typography className="h4">
                  {territory.number} · {territory.name}
                </Typography>
                <Select
                  label={tx('Active assignment')}
                  value={choice ? (choice.target ? 'transfer' : 'return') : ''}
                  onChange={(event) =>
                    update(territory.id, {
                      target:
                        event.target.value === 'transfer'
                          ? '__choose__'
                          : undefined,
                    })
                  }
                >
                  <MenuItem value="return">{tx('Return now')}</MenuItem>
                  <MenuItem value="transfer">
                    {tx('Transfer to another publisher')}
                  </MenuItem>
                </Select>
                {choice?.target && (
                  <PublisherSearch
                    options={options}
                    value={
                      options.find((item) => item.name === choice.target) ??
                      null
                    }
                    onChange={(value) =>
                      update(territory.id, {
                        target: value?.name ?? '__choose__',
                      })
                    }
                    getName={(item) => item.name}
                  />
                )}
              </Stack>
            );
          })}
          {linkedDevices(person.id, links) > 0 && (
            <Typography>
              {tx(
                'Linked devices will keep their data and will need to select a publisher again.'
              )}
            </Typography>
          )}
        </>
      )}
      {error && (
        <Typography role="alert" color="var(--red-main)">
          {error}
        </Typography>
      )}
      <DialogActions>
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          disabled={
            busy ||
            (mode === 'merge'
              ? !target
              : held.some(
                  (item) =>
                    !resolutions[item.id] ||
                    resolutions[item.id].target === '__choose__'
                ))
          }
          onClick={save}
        >
          {mode === 'merge' ? tx('Merge') : tx('Remove')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
export default ManagePublisher;
