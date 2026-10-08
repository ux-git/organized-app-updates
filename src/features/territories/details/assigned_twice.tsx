import { Stack } from '@mui/material';
import { Button } from '@components/index';
import InfoBanner from '@components/info_banner';
import { Territory } from '@definition/territory';
import { tx } from '@services/i18n/translation';
import {
  closeOlderAssignments,
  olderOpenAssignments,
  parseDate,
} from '../helpers';
import { holderText } from '../group_holder';

const time = (value?: string) => parseDate(value)?.getTime() ?? 0;

// two devices handed the territory out while apart, and the sync kept both
const AssignedTwice = ({
  territory,
  onChange,
}: {
  territory: Territory;
  onChange: (territory: Territory) => void;
}) => {
  if (olderOpenAssignments(territory.assignments).length === 0) return null;

  const names = territory.assignments
    .filter((item) => !item.returnedOn)
    .sort((a, b) => time(b.assignedOn) - time(a.assignedOn))
    .map(holderText)
    .join(', ');

  return (
    <Stack spacing="8px" sx={{ alignItems: 'flex-start' }}>
      <InfoBanner sx={{ width: '100%' }}>
        {tx(
          'Assigned twice after a sync: {{names}}. Only the newest assignment should stay open.',
          { names }
        )}
      </InfoBanner>

      <Button
        variant="small"
        disableAutoStretch
        onClick={() => onChange(closeOlderAssignments(territory))}
        sx={{ minHeight: '32px' }}
      >
        {tx('End the older assignment')}
      </Button>
    </Stack>
  );
};

export default AssignedTwice;
