import { Box, Stack } from '@mui/material';
import { Button } from '@components/index';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { IconMoveForward, IconReject } from '@icons/index';
import { coveredText } from '../helpers';
import {
  CategoryBadges,
  DoNotCallBadge,
  StatusBadge,
} from './territory_badges';
import StatTile from './stat_tile';
import { Territory, TYPE_LABEL } from '@definition/territory';
import { tx } from '@services/i18n/translation';

type ReviewDialogProps = {
  territory?: Territory;
  onClose: VoidFunction;
  onAssign: (id: string, publisher: string) => void;
  onDecline: (id: string) => void;
};

const ReviewDialog = ({
  territory,
  onClose,
  onAssign,
  onDecline,
}: ReviewDialogProps) => {
  if (!territory?.requestedBy) return null;

  const publisher = territory.requestedBy;

  return (
    <Dialog
      onClose={onClose}
      open
      closable
      title={tx('Request for territory')}
      description={[territory.number, territory.name, territory.city]
        .filter(Boolean)
        .join(' · ')}
    >
      <Stack
        direction="row"
        sx={{
          width: '100%',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <Box sx={{ width: 'fit-content' }}>
          <StatusBadge status={territory.status} />
        </Box>
        <DoNotCallBadge territory={territory} />
        <CategoryBadges territory={territory} max={4} />
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '8px',
          width: '100%',
        }}
      >
        <StatTile label={tx('Requested by')} value={publisher} />
        <StatTile label={tx('Last covered')} value={coveredText(territory)} />
        <StatTile label={tx('Type')} value={tx(TYPE_LABEL[territory.type])} />
        <StatTile
          label={tx('Households')}
          value={String(territory.households)}
        />
      </Box>

      <DialogActions>
        <Button
          variant="secondary"
          color="red"
          startIcon={<IconReject color="var(--red-main)" />}
          onClick={() => {
            onDecline(territory.id);
            onClose();
          }}
        >
          {tx('Refuse')}
        </Button>
        <Button
          variant="main"
          startIcon={<IconMoveForward color="var(--always-white)" />}
          onClick={() => {
            onAssign(territory.id, publisher);
            onClose();
          }}
        >
          {tx('Assign')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReviewDialog;
