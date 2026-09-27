import { useState } from 'react';
import { Box, MenuItem, Stack } from '@mui/material';
import { Button, Select, Typography } from '@components/index';
import InfoBanner from '@components/info_banner';
import DatePicker from '@components/date_picker';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import MenuSubHeader from '@components/menu_sub_header';
import { useBreakpoints } from '@hooks/index';
import { IconCancelCicle } from '@icons/index';
import { GROUPS, PUBLISHERS_ONLY } from '../mockData';
import { assignmentIssues, suggestedPublisher, toStoredDate } from '../helpers';
import { Territory } from '@definition/territory';
import { tx } from '@services/i18n/translation';

type AssignDialogProps = {
  title: string;
  subtitle?: string;
  requestedBy?: string;
  // a reminder for whoever hands the card over
  doNotCallNote?: string;
  territories: Territory[];
  onClose: VoidFunction;
  onAssign: (publisher: string, assignedOn: Date) => void;
};

const AssignDialog = ({
  title,
  subtitle,
  requestedBy,
  doNotCallNote,
  territories,
  onClose,
  onAssign,
}: AssignDialogProps) => {
  const { tablet600Up } = useBreakpoints();

  const [publisher, setPublisher] = useState(
    requestedBy ?? suggestedPublisher(territories)
  );
  const [assignedOn, setAssignedOn] = useState<Date | null>(new Date());

  const future =
    !!assignedOn &&
    assignmentIssues({ assignedOn: toStoredDate(assignedOn) }).length > 0;

  return (
    <Dialog onClose={onClose} open title={title} description={subtitle}>
      {doNotCallNote && (
        <InfoBanner
          variant="red"
          icon={<IconCancelCicle color="var(--red-main)" />}
          className="body-small-semibold"
          sx={{ width: '100%' }}
        >
          {doNotCallNote}
        </InfoBanner>
      )}

      <Stack
        direction={tablet600Up ? 'row' : 'column'}
        spacing="16px"
        sx={{ width: '100%' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Select
            label={tx('Publisher')}
            value={publisher}
            onChange={(event) => setPublisher(event.target.value as string)}
          >
            <MenuSubHeader>{tx('Groups')}</MenuSubHeader>
            {GROUPS.map((name) => (
              <MenuItem key={name} value={name}>
                <Typography className="body-regular">{name}</Typography>
              </MenuItem>
            ))}

            <MenuSubHeader>{tx('Publishers')}</MenuSubHeader>
            {PUBLISHERS_ONLY.map((name) => (
              <MenuItem key={name} value={name}>
                <Typography className="body-regular">{name}</Typography>
              </MenuItem>
            ))}
          </Select>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <DatePicker
            label={tx('Assigned on')}
            value={assignedOn}
            error={future}
            helperText={future ? tx('This date is in the future') : ''}
            onChange={(value) => setAssignedOn(value)}
          />
        </Box>
      </Stack>

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          onClick={() => {
            onAssign(publisher, assignedOn ?? new Date());
            onClose();
          }}
        >
          {tx('Assign')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssignDialog;
