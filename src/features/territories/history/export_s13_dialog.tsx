import { useAppTranslation } from '@hooks/index';
import { useState } from 'react';
import { Button } from '@components/index';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import SwitchWithLabel from '@components/switch_with_label';

const ExportS13Dialog = ({
  isProcessing,
  onClose,
  onExport,
}: {
  isProcessing: boolean;
  onClose: VoidFunction;
  onExport: (markCampaigns: boolean) => void;
}) => {
  const { t } = useAppTranslation();

  const [withCampaigns, setWithCampaigns] = useState(false);

  return (
    <Dialog
      onClose={onClose}
      open
      title={t('tr_territoryExportS13')}
      description={t('tr_territoryAllRecordedAssignmentsThroughToday')}
    >
      <SwitchWithLabel
        label={t('tr_territoryMarkCampaignAssignments')}
        helper={t('tr_territoryMarkCampaignDatesAllAssignmentsStayIncluded')}
        checked={withCampaigns}
        onChange={setWithCampaigns}
      />

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t('tr_cancel')}
        </Button>
        <Button
          variant="main"
          disabled={isProcessing}
          onClick={() => onExport(withCampaigns)}
        >
          {t('tr_export')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ExportS13Dialog;
