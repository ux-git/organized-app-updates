import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Box, Stack } from '@mui/material';
import {
  Badge,
  Button,
  CustomDivider,
  InfoNote,
  Typography,
} from '@components/index';
import { emptyListMessage, PublisherSort, sortedPublishers } from '../helpers';
import TruncatedText from './truncated_text';
import { tx } from '@services/i18n/translation';

export const PublisherSortButton = ({
  sort,
  onChange,
}: {
  sort: PublisherSort;
  onChange: (sort: PublisherSort) => void;
}) => (
  <Button
    variant="small"
    disableAutoStretch
    minHeight={32}
    onClick={() => onChange(sort === 'count' ? 'name' : 'count')}
  >
    {sort === 'count' ? tx('Sort: most held') : tx('Sort: name')}
  </Button>
);

const PublisherLoad = ({
  entries,
  sort,
  limit = 10,
}: {
  entries: { publisher: string; count: number }[];
  sort: PublisherSort;
  limit?: number;
}) => {
  const navigate = useNavigate();

  const [shown, setShown] = useState(limit);

  if (entries.length === 0) {
    return <InfoNote message={emptyListMessage()} />;
  }

  const openTerritories = (holder: string) =>
    navigate('/territories?tab=all', {
      state: { parent: 'Territory coverage statistics', holder },
    });

  return (
    <>
      <Stack
        spacing="4px"
        divider={<CustomDivider color="var(--accent-200)" />}
      >
        {sortedPublishers(entries, sort)
          .slice(0, shown)
          .map((entry, index) => (
            <Stack
              key={entry.publisher}
              direction="row"
              spacing="12px"
              onClick={
                entry.count > 0
                  ? () => openTerritories(entry.publisher)
                  : undefined
              }
              sx={{
                alignItems: 'center',
                padding: '10px 8px',
                borderRadius: 'var(--radius-m)',
                ...(entry.count > 0 && {
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                  '&:hover': { backgroundColor: 'var(--accent-100)' },
                }),
              }}
            >
              <Typography
                className="label-small-regular"
                color="var(--grey-350)"
                sx={{ width: '20px', flexShrink: 0 }}
              >
                {index + 1}
              </Typography>

              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <TruncatedText
                  className="body-small-regular"
                  color="var(--grey-400)"
                  text={entry.publisher}
                />
              </Box>

              <Box sx={{ width: 'fit-content' }}>
                <Badge
                  size="small"
                  filled={false}
                  color={entry.count > 0 ? 'accent' : 'grey'}
                  text={String(entry.count)}
                />
              </Box>
            </Stack>
          ))}
      </Stack>

      {entries.length > shown && (
        <Button
          variant="small"
          disableAutoStretch
          onClick={() => setShown(shown + limit)}
          sx={{ alignSelf: 'flex-start' }}
        >
          {tx('Show more')}
        </Button>
      )}
    </>
  );
};

export default PublisherLoad;
