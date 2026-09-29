import { tx } from '@services/i18n/translation';
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box, MenuItem, Stack } from '@mui/material';
import { Button, Select, TextField, Typography } from '@components/index';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { useBreakpoints } from '@hooks/index';
import { IconLocation } from '@icons/index';
import { DoNotCall } from '@definition/territory';
import { parseDate, toStoredDate } from '../helpers';
import { currentPublisherState } from '../assignees';
import EditorHeader from '../components/editor_header';

const DoNotCallEditor = ({
  entry,
  numbers,
  onClose,
  onSave,
  onDelete,
  onOpenInMaps,
}: {
  entry?: DoNotCall;
  // a phone territory marks one of its own numbers instead of an address
  numbers?: string[];
  onClose: VoidFunction;
  onSave: (next: DoNotCall) => void;
  onDelete?: VoidFunction;
  // the address as typed, in the maps app
  onOpenInMaps?: (address: string) => void;
}) => {
  const { tablet600Up } = useBreakpoints();

  const me = useAtomValue(currentPublisherState);

  const [address, setAddress] = useState(entry?.address ?? '');
  const [name, setName] = useState(entry?.name ?? '');
  const [date, setDate] = useState<Date | null>(
    parseDate(entry?.date) ?? new Date()
  );
  const [confirming, setConfirming] = useState(false);

  const handleSave = () => {
    onSave({
      id: entry?.id ?? `dnc-${Date.now()}`,
      address: address.trim(),
      name: name.trim() || undefined,
      date: toStoredDate(date ?? new Date()),
      addedBy: entry?.addedBy ?? me,
    });
    onClose();
  };

  if (confirming && onDelete) {
    return (
      <Dialog
        onClose={() => setConfirming(false)}
        open
        title={numbers ? tx('Delete number?') : tx('Delete address?')}
        description={tx('It will be removed on all devices.')}
      >
        <DialogActions>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {tx('Cancel')}
          </Button>
          <Button
            variant="main"
            color="red"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            {tx('Delete')}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog
      onClose={onClose}
      open
      header={
        <EditorHeader
          title={
            numbers
              ? entry
                ? tx('Edit do-not-call number')
                : tx('Add do-not-call number')
              : entry
                ? tx('Edit do-not-call address')
                : tx('Add do-not-call address')
          }
          description={
            numbers
              ? tx('A number the publishers should not call, and since when.')
              : tx('An address the publishers should skip, and since when.')
          }
          onDelete={entry && onDelete ? () => setConfirming(true) : undefined}
        />
      }
    >
      {numbers ? (
        <Select
          label={tx('Phone number')}
          value={address}
          onChange={(event) => setAddress(event.target.value as string)}
        >
          {numbers.map((number) => (
            <MenuItem key={number} value={number}>
              <Typography className="body-regular">{number}</Typography>
            </MenuItem>
          ))}
        </Select>
      ) : (
        <TextField
          label={tx('Address')}
          autoFocus={!entry}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      )}

      <Stack
        direction={tablet600Up ? 'row' : 'column'}
        spacing="16px"
        sx={{ width: '100%' }}
      >
        {!numbers && (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <TextField
              label={tx('Name')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Box>
        )}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DatePicker
            label={tx('Date')}
            value={date}
            onChange={(value) => setDate(value)}
          />
        </Box>
      </Stack>

      {onOpenInMaps && !numbers && (
        <Button
          variant="small"
          disableAutoStretch
          disabled={!address.trim()}
          startIcon={<IconLocation color="var(--accent-main)" />}
          onClick={() => onOpenInMaps(address.trim())}
          sx={{ minHeight: '32px', minWidth: 'unset', marginTop: '-8px' }}
        >
          {tx('Open in maps')}
        </Button>
      )}

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button variant="main" disabled={!address.trim()} onClick={handleSave}>
          {tx('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DoNotCallEditor;
