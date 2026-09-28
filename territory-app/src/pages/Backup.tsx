import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Stack } from '@mui/material';
import InfoNote from '@components/info_note';
import MenuItem from '@components/menuitem';
import Select from '@components/select';
import TimePicker from '@components/time_picker';
import Typography from '@components/typography';
import WaitingLoader from '@components/waiting_loader';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
} from '@features/congregation/settings/shared_styles';
import { invoke, nearby } from '../native';
import { play } from '../haptics';
import { t } from '../i18n';
import { Actions } from './sync/parts';
import { notify, when } from './sync/text';
import useBackup, {
  BackupFrequency,
  BackupStatus,
  backupName,
  restoreBackup,
} from './useBackup';

const FREQUENCIES: BackupFrequency[] = ['off', 'daily', 'weekly', 'monthly'];

const hour12 = () =>
  !!new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions()
    .hour12;

const size = (bytes: number, locale: string) =>
  bytes < 1024 * 1024
    ? new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'kilobyte',
        maximumFractionDigits: 0,
      }).format(Math.max(1, bytes / 1024))
    : new Intl.NumberFormat(locale, {
        style: 'unit',
        unit: 'megabyte',
        maximumFractionDigits: 1,
      }).format(bytes / 1024 / 1024);

const LastBackup = ({ status }: { status: BackupStatus }) => {
  const { i18n } = useTranslation();
  const { last, error, folder, folderOk } = status;

  if (error || (folder && !folderOk)) {
    const lost = error === 'folder' || !folderOk;
    return (
      <Typography className="body-small-regular" color="var(--red-main)">
        {lost ? t('backup.errorFolder') : t('backup.errorWrite')}
      </Typography>
    );
  }

  return (
    <Typography className="body-small-regular" color="var(--grey-400)">
      {last
        ? t('backup.last', {
            when: when(last.at / 1000, true),
            size: size(last.size, i18n.language === 'deu' ? 'de' : 'en'),
            folder: last.folder,
          })
        : t('backup.none')}
    </Typography>
  );
};

// the device answers at once; this long, it's not going to
const STATUS_WAIT = 8000;

const NoStatus = () => {
  const [late, setLate] = useState(false);

  useEffect(() => {
    if (late) return;
    const timer = setTimeout(() => setLate(true), STATUS_WAIT);
    return () => clearTimeout(timer);
  }, [late]);

  if (!late) {
    return (
      <Box sx={{ padding: '48px 0' }}>
        <WaitingLoader variant="standard" size={56} />
      </Box>
    );
  }

  return (
    <CardSection>
      <CardSectionHeader
        title={t('backup.noStatus')}
        description={t('backup.noStatusText')}
      />
      <Actions
        actions={[
          {
            label: t('common.tryAgain'),
            kind: 'main',
            onClick: () => {
              setLate(false);
              nearby('backupStatus');
            },
          },
        ]}
      />
    </CardSection>
  );
};

// Backup: a full copy of what this device holds, by hand or on a schedule,
// saved to a folder the user picked (Backups.kt, Backups.swift)
const Backup = () => {
  const status = useBackup();
  const fileInput = useRef<HTMLInputElement>(null);
  // Back up now shows how it went once the device is done
  const askedAt = useRef(0);

  useEffect(() => {
    if (!status || !askedAt.current || status.ended < askedAt.current) return;
    askedAt.current = 0;
    if (status.error) {
      play('error');
      notify(t('backup.failed'), t('backup.failedText'), 'error');
    } else {
      play('synced');
      notify(
        t('backup.saved'),
        t('backup.savedText', { folder: status.folder })
      );
    }
  }, [status]);

  if (!status) return <NoStatus />;

  const frequency = status.frequency;
  const time = new Date();
  time.setHours(status.hour, status.minute, 0, 0);

  const setSchedule = (next: Partial<BackupStatus>) =>
    nearby('backupSchedule', {
      frequency,
      hour: status.hour,
      minute: status.minute,
      ...next,
    });

  const backUpNow = () => {
    askedAt.current = Date.now();
    nearby('backupNow');
  };

  const exportFile = async () => {
    try {
      const text = await invoke<string>('backup_export');
      nearby('shareFile', { name: backupName(), text });
    } catch (error) {
      console.error('backup: export failed', error);
      notify(t('common.somethingWrong'), t('backup.exportFailed'), 'error');
    }
  };

  const openFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await restoreBackup(await file.text());
  };

  const folderText = status.folder
    ? t('backup.folderIs', { folder: status.folder })
    : t('backup.noFolder');

  return (
    <>
      <CardSection>
        <CardSectionHeader
          title={t('backup.title')}
          description={t('backup.description')}
        />
        <CardSectionContent>
          <Stack spacing="16px">
            <Box
              sx={{
                display: 'flex',
                gap: '16px',
                flexWrap: 'wrap',
                '& > *': { flex: '1 1 200px' },
              }}
            >
              <Select
                label={t('backup.frequency')}
                value={frequency}
                onChange={(event) =>
                  setSchedule({
                    frequency: event.target.value as BackupFrequency,
                  })
                }
              >
                {FREQUENCIES.map((option) => (
                  <MenuItem key={option} value={option}>
                    <Typography className="body-regular" color="var(--black)">
                      {t(`backup.${option}`)}
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
              {frequency !== 'off' && (
                <TimePicker
                  ampm={hour12()}
                  label={t('backup.time')}
                  value={time}
                  onChange={(value) =>
                    setSchedule({
                      hour: value.getHours(),
                      minute: value.getMinutes(),
                    })
                  }
                />
              )}
            </Box>
            {frequency !== 'off' && status.approximate && (
              <Typography
                className="body-small-regular"
                color="var(--grey-400)"
              >
                {t('backup.approximate')}
              </Typography>
            )}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '12px',
                borderRadius: 'var(--radius-l)',
                backgroundColor: 'var(--accent-150)',
              }}
            >
              <Typography className="body-regular">{folderText}</Typography>
              <LastBackup status={status} />
            </Box>
            <InfoNote message={t('backup.plainText')} />
            <Actions
              actions={[
                {
                  label: status.folder
                    ? t('backup.changeFolder')
                    : t('backup.chooseFolder'),
                  onClick: () => nearby('backupFolder'),
                  // without a folder, choosing one comes first
                  kind: status.folder ? 'tertiary' : 'main',
                },
                {
                  label: t('backup.export'),
                  onClick: exportFile,
                  kind: status.folder ? 'secondary' : 'tertiary',
                },
                {
                  label: status.running ? t('backup.running') : t('backup.now'),
                  onClick: backUpNow,
                  kind: status.folder ? 'main' : 'secondary',
                  disabled: status.running,
                },
              ]}
            />
          </Stack>
        </CardSectionContent>
      </CardSection>

      <CardSection>
        <CardSectionHeader
          title={t('backup.restoreSection')}
          description={t('backup.restoreSectionText')}
        />
        <Actions
          actions={[
            {
              label: t('backup.restoreFile'),
              onClick: () => fileInput.current?.click(),
            },
          ]}
        />
        <input ref={fileInput} type="file" hidden onChange={openFile} />
      </CardSection>
    </>
  );
};

export default Backup;
