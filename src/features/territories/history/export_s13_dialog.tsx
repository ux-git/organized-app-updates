import { useState } from 'react';
import { Button } from '@components/index';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import SwitchWithLabel from '@components/switch_with_label';
import { tx } from '@services/i18n/translation';

const ExportS13Dialog = ({
  isProcessing,
  onClose,
  onExport,
}: {
  isProcessing: boolean;
  onClose: VoidFunction;
  onExport: (markCampaigns: boolean) => void;
}) => {
  const [withCampaigns, setWithCampaigns] = useState(false);

  return (
    <Dialog
      onClose={onClose}
      open
      title={tx('Export S-13')}
      description={tx('All recorded assignments through today.')}
    >
      <SwitchWithLabel
        label={tx('Mark campaign assignments')}
        helper={tx('Mark campaign dates. All assignments stay included.')}
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
          onClick={() => onExport(withCampaigns)}
        >
          {tx('Export')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportS13Dialog;
