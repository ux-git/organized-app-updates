import { Stack } from '@mui/material';
import { useAppTranslation } from '@hooks/index';
import { LocalOnlyCategory } from '@definition/settings';
import useLocalOnlyCategories from './useLocalOnlyCategories';
import Button from '@components/button';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import SwitchWithLabel from '@components/switch_with_label';
import Typography from '@components/typography';

const CATEGORY_LABELS: Record<LocalOnlyCategory, [string, string]> = {
  cong_field_service_reports: [
    'tr_localOnlyCongReports',
    'tr_localOnlyCongReportsDesc',
  ],
  branch_field_service_reports: [
    'tr_localOnlyBranchReports',
    'tr_localOnlyBranchReportsDesc',
  ],
  branch_cong_analysis: [
    'tr_localOnlyCongAnalysis',
    'tr_localOnlyCongAnalysisDesc',
  ],
};

const LocalOnlyCategories = () => {
  const { t } = useAppTranslation();

  const {
    categories,
    localOnly,
    pendingCategory,
    isEnabling,
    isPending,
    canToggle,
    handleToggle,
    handleConfirm,
    handleCancel,
  } = useLocalOnlyCategories();

  if (categories.length === 0) return null;

  return (
    <Stack spacing="16px">
      {pendingCategory && (
        <Dialog
          open={!!pendingCategory}
          onClose={handleCancel}
          title={t(CATEGORY_LABELS[pendingCategory][0])}
          description={t(
            isEnabling ? 'tr_localOnlyConfirmDesc' : 'tr_localOnlyDisableDesc'
          )}
        >
          <DialogActions>
            <Button variant="secondary" onClick={handleCancel}>
              {t('tr_cancel')}
            </Button>
            <Button
              variant="main"
              color={isEnabling ? 'red' : undefined}
              onClick={handleConfirm}
            >
              {t('tr_confirm')}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {categories.map((category) => (
        <SwitchWithLabel
          key={category}
          label={t(CATEGORY_LABELS[category][0])}
          helper={t(CATEGORY_LABELS[category][1])}
          checked={localOnly.includes(category)}
          onChange={() => handleToggle(category)}
          readOnly={!canToggle(category)}
        />
      ))}

      {isPending && (
        <Typography
          className="label-small-regular"
          sx={{ color: 'var(--orange-dark)' }}
        >
          {t('tr_localOnlyPending')}
        </Typography>
      )}
    </Stack>
  );
};

export default LocalOnlyCategories;
