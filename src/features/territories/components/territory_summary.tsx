import { Box, Stack } from '@mui/material';
import { Typography } from '@components/index';
import { IconPerson } from '@icons/index';
import { Territory, TYPE_LABEL } from '@definition/territory';
import {
  CardLostBadge,
  CategoryBadges,
  DoNotCallBadge,
  PrintedCardBadge,
  StatusBadge,
} from './territory_badges';
import { tx } from '@services/i18n/translation';

const row = {
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '8px',
  minWidth: 0,
} as const;

const TerritorySummary = ({
  territory,
  meta,
  heading = false,
  showDoNotCalls = false,
  onDoNotCalls,
}: {
  territory: Territory;
  meta?: string;
  heading?: boolean;
  showDoNotCalls?: boolean;
  onDoNotCalls?: VoidFunction;
}) => {
  const description = [
    heading && territory.city,
    tx(TYPE_LABEL[territory.type]),
  ]
    .filter(Boolean)
    .join(' · ');

  const state = (
    <Stack direction="row" sx={row}>
      <Box sx={{ width: 'fit-content' }}>
        <StatusBadge status={territory.status} />
      </Box>

      {meta && (
        <Typography className="label-small-regular" color="var(--grey-400)">
          {meta}
        </Typography>
      )}
    </Stack>
  );

  if (!heading) {
    return (
      <Stack direction="row" sx={row}>
        {state}
        <Typography className="label-small-regular" color="var(--grey-350)">
          {description}
        </Typography>
      </Stack>
    );
  }

  // the badges sit top right, centred on the title; the holder wraps under
  // the description on a phone
  return (
    <Stack spacing="4px">
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <Typography className="h2" color="var(--black)" sx={{ minWidth: 0 }}>
          {tx('Overview')}
        </Typography>

        <Stack
          direction="row"
          sx={{ alignItems: 'center', gap: '6px', flexShrink: 0 }}
        >
          {showDoNotCalls && (
            <DoNotCallBadge territory={territory} onClick={onDoNotCalls} />
          )}
          <StatusBadge status={territory.status} />
        </Stack>
      </Stack>

      <Stack
        direction="row"
        sx={{
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '4px 16px',
        }}
      >
        {/* as tall as a badge, so marking the card lost doesn't shift the card */}
        <Stack direction="row" sx={{ ...row, minHeight: '20px' }}>
          <Typography className="body-small-regular" color="var(--grey-400)">
            {description}
          </Typography>
          <CardLostBadge territory={territory} />
          <PrintedCardBadge territory={territory} />
          <CategoryBadges territory={territory} wrap />
        </Stack>

        {meta && (
          <Stack direction="row" sx={{ alignItems: 'center', gap: '4px' }}>
            <IconPerson color="var(--grey-400)" width={16} height={16} />
            <Typography className="label-small-regular" color="var(--grey-400)">
              {meta}
            </Typography>
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};

export default TerritorySummary;
