import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Stack } from '@mui/material';
import { Button, Typography } from '@components/index';
import {
  congregationBoundaryState,
  territoriesState,
} from '@states/territories';
import {
  offlineMapState,
  mapDownloads,
  OfflineRegion,
} from '@services/maps/offline';
import { tx } from '@services/i18n/translation';
import { tileUrls } from '@services/maps/tiles';
import { shortDateFormatState } from '@states/settings';
import { formatDate } from '@utils/date';
import { boundaryBounds } from './helpers';

const OfflineSettings = ({ provider }: { provider: string }) => {
  const state = useAtomValue(offlineMapState);
  const dateFormat = useAtomValue(shortDateFormatState);
  const boundary = useAtomValue(congregationBoundaryState);
  const territories = useAtomValue(territoriesState);
  const [error, setError] = useState('');
  const area = useMemo(
    () =>
      boundary?.length
        ? boundary
        : territories.flatMap((item) => item.boundary ?? []),
    [boundary, territories]
  );
  const estimate = useMemo(() => {
    if (!area.length) return null;
    try {
      return Math.ceil(
        tileUrls('{z}/{x}/{y}', boundaryBounds(area) as OfflineRegion['bounds'])
          .length *
          0.08 +
          40
      );
    } catch {
      return null;
    }
  }, [area]);
  if (!state.available) return null;
  const download = () => {
    if (!area.length) return;
    setError('');
    void mapDownloads()?.download(
      boundaryBounds(area) as OfflineRegion['bounds'],
      provider
    );
  };
  // the action sits beside the text it belongs to; what follows from it goes below
  const action = state.busy ? (
    <Button variant="secondary" onClick={() => mapDownloads()?.cancel()}>
      {tx('Cancel')}
    </Button>
  ) : (
    <Button variant="secondary" disabled={!area.length} onClick={download}>
      {state.region ? tx('Update') : tx('Download')}
    </Button>
  );

  return (
    <Stack spacing="8px">
      <Stack direction="row" sx={{ alignItems: 'center', gap: '16px' }}>
        <Stack spacing="4px" sx={{ flex: 1, minWidth: 0 }}>
          <Typography className="h4">{tx('Offline map')}</Typography>
          <Typography className="body-small-regular" color="var(--grey-400)">
            {tx(
              'Download streets and both map themes for offline use. Stored on this device, outside backups.'
            )}
          </Typography>
        </Stack>
        <Stack sx={{ flexShrink: 0 }}>{action}</Stack>
      </Stack>
      {estimate !== null && !state.region && (
        <Typography className="label-small-regular" color="var(--grey-400)">
          {tx(
            'Estimated download: {{size}} MB. Actual size depends on map detail (maximum 300 MB).',
            { size: estimate }
          )}
        </Typography>
      )}
      {state.region && (
        <Typography className="body-small-regular">
          {tx('Downloaded {{date}} · {{size}} MB', {
            date: formatDate(new Date(state.region.date), dateFormat),
            size: (state.region.bytes / 1024 / 1024).toFixed(1),
          })}
        </Typography>
      )}
      {state.busy && (
        <Typography role="status" className="body-small-regular">
          {tx('Downloading map: {{done}} / {{total}}', {
            done: state.done,
            total: state.total || '…',
          })}
        </Typography>
      )}
      {(error || state.error) && (
        <Typography role="alert" color="var(--red-main)">
          {tx(error || state.error!)}
        </Typography>
      )}
      {!state.busy && !area.length && (
        <Typography className="body-small-regular" color="var(--grey-400)">
          {tx('Draw a territory or congregation boundary first.')}
        </Typography>
      )}
      {!state.busy && state.region && (
        <Button
          variant="tertiary"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() =>
            void mapDownloads()
              ?.remove()
              .catch((error) => setError((error as Error).message))
          }
        >
          {tx('Remove download')}
        </Button>
      )}
    </Stack>
  );
};
export default OfflineSettings;
