import { useState } from 'react';
import { MenuItem } from '@mui/material';
import { Button, Select, Typography } from '@components/index';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import SwitchWithLabel from '@components/switch_with_label';
import { serviceYear } from '../helpers';
import { tx } from '@services/i18n/translation';

const label = (year: number) => `${year - 1}/${year}`;

const ExportS13Dialog = ({
  isProcessing,
  onClose,
  onExport,
}: {
  isProcessing: boolean;
  onClose: VoidFunction;
  onExport: (year: number, withCampaigns: boolean) => void;
}) => {
  const current = serviceYear();
  const years = [current, current - 1, current - 2];

  const [year, setYear] = useState(current);
  const [withCampaigns, setWithCampaigns] = useState(false);

  return (
    <Dialog
      onClose={onClose}
      open
      title={tx('Export S-13')}
      description={tx(
        'The territory assignment record of one service year, September to August.'
      )}
    >
      <Select
        label={tx('Service year')}
        value={year}
        onChange={(event) => setYear(Number(event.target.value))}
      >
        {years.map((item) => (
          <MenuItem key={item} value={item}>
            <Typography className="body-regular">{label(item)}</Typography>
          </MenuItem>
        ))}
      </Select>

      <SwitchWithLabel
        label={tx('Include campaigns (marked "(A)")')}
        helper={tx(
          'Work done for a special campaign only, which does not count as regular coverage.'
        )}
        checked={withCampaigns}
        onChange={setWithCampaigns}
      />

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          disabled={isProcessing}
          onClick={() => onExport(year, withCampaigns)}
        >
          {tx('Export')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportS13Dialog;
