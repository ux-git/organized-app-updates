import { Box, Stack } from '@mui/material';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '../shared_styles';
import { useAppTranslation } from '@hooks/index';
import {
  AppModuleId,
  MODULE_SYNC_METHODS,
  ModuleSyncMethod,
} from '@definition/settings';
import useAppModules from './useAppModules';
import Button from '@components/button';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import MenuItem from '@components/menuitem';
import Select from '@components/select';
import SwitchWithLabel from '@components/switch_with_label';
import Typography from '@components/typography';

const MODULE_LABELS: Record<AppModuleId, [string, string]> = {
  field_service_reports: [
    'tr_moduleFieldServiceReports',
    'tr_moduleFieldServiceReportsDesc',
  ],
  publisher_records: [
    'tr_modulePublisherRecords',
    'tr_modulePublisherRecordsDesc',
  ],
  branch_reports: ['tr_moduleBranchReports', 'tr_moduleBranchReportsDesc'],
  meeting_attendance: [
    'tr_moduleMeetingAttendance',
    'tr_moduleMeetingAttendanceDesc',
  ],
};

const SYNC_LABELS: Record<ModuleSyncMethod, string> = {
  server: 'tr_moduleSyncServer',
  local: 'tr_moduleSyncLocal',
  device: 'tr_moduleSyncDevice',
};

const AppModules = () => {
  const { t } = useAppTranslation();

  const {
    modules,
    syncVisible,
    canEnable,
    canChoose,
    pendingChange,
    isPending,
    handleToggleEnabled,
    handleChooseSync,
    handleCancel,
    handleConfirm,
  } = useAppModules();

  const leavingServer = pendingChange?.sync !== 'server';

  return (
    <CardSection>
      <CardSectionHeader
        title={t('tr_appModules')}
        description={t('tr_appModulesDesc')}
      />

      {pendingChange && (
        <Dialog
          open={!!pendingChange}
          onClose={handleCancel}
          title={t(MODULE_LABELS[pendingChange.module][0])}
          description={t(
            leavingServer
              ? 'tr_moduleLeaveServerDesc'
              : 'tr_moduleRejoinServerDesc'
          )}
        >
          <DialogActions>
            <Button variant="secondary" onClick={handleCancel}>
              {t('tr_cancel')}
            </Button>
            <Button
              variant="main"
              color={leavingServer ? 'red' : undefined}
              onClick={handleConfirm}
            >
              {t('tr_confirm')}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <CardSectionContent spacing="16px">
        <Stack spacing="16px">
          {modules.map(({ id, entry, follows }) => (
            <Box
              key={id}
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                gap: '12px 24px',
              }}
            >
              <Box sx={{ flex: '1 1 320px', minWidth: 0 }}>
                <SwitchWithLabel
                  label={t(MODULE_LABELS[id][0])}
                  helper={t(MODULE_LABELS[id][1])}
                  checked={entry.enabled}
                  onChange={() => handleToggleEnabled(id)}
                  readOnly={!canEnable}
                />
              </Box>

              {!follows && syncVisible(id) && (
                <Box sx={{ flex: '0 1 260px', minWidth: 0 }}>
                  <Select
                    label={t('tr_moduleSync')}
                    value={entry.sync}
                    onChange={(e) =>
                      handleChooseSync(id, e.target.value as ModuleSyncMethod)
                    }
                    disabled={!entry.enabled}
                  >
                    {MODULE_SYNC_METHODS.map((method) => (
                      <MenuItem
                        key={method}
                        value={method}
                        disabled={!canChoose(id, method)}
                      >
                        <Box>
                          <Typography>{t(SYNC_LABELS[method])}</Typography>
                          {method === 'local' && (
                            <Typography
                              className="label-small-regular"
                              color="var(--grey-350)"
                            >
                              {t('tr_moduleSyncLocalHint')}
                            </Typography>
                          )}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              )}
            </Box>
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
      </CardSectionContent>
    </CardSection>
  );
};

export default AppModules;
