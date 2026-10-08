import { useAtom, useAtomValue } from 'jotai';
import { Stack } from '@mui/material';
import { Select, Typography } from '@components/index';
import MenuItem from '@components/menuitem';
import {
  territoryCategoriesState,
  territoryRecommendationsState,
} from '@states/territories';
import { TerritoryType, TYPE_LABEL } from '@definition/territory';
import { tx } from '@services/i18n/translation';

const RecommendationSettings = () => {
  const [value, setValue] = useAtom(territoryRecommendationsState);
  const categories = useAtomValue(territoryCategoriesState);
  return (
    <Stack spacing="16px">
      <Typography className="h4">{tx('Recommendations')}</Typography>
      <Select
        label={tx('Months after return')}
        value={value.cooldownMonths}
        onChange={(event) =>
          setValue({ ...value, cooldownMonths: Number(event.target.value) })
        }
      >
        {Array.from({ length: 13 }, (_, n) => (
          <MenuItem key={n} value={n}>
            {n === 0 ? tx('No waiting period') : n}
          </MenuItem>
        ))}
      </Select>
      <Typography className="body-small-regular" color="var(--grey-400)">
        {tx(
          'Months since last return. Never-assigned territories appear immediately.'
        )}
      </Typography>
      <Select
        multiple
        label={tx('Exclude categories')}
        value={value.categories}
        onChange={(event) =>
          setValue({ ...value, categories: event.target.value as string[] })
        }
      >
        {categories.map((item) => (
          <MenuItem key={item.id} value={item.id}>
            {item.name}
          </MenuItem>
        ))}
      </Select>
      <Select
        multiple
        label={tx('Exclude territory types')}
        value={value.types}
        onChange={(event) =>
          setValue({ ...value, types: event.target.value as TerritoryType[] })
        }
      >
        {(Object.keys(TYPE_LABEL) as TerritoryType[]).map((type) => (
          <MenuItem key={type} value={type}>
            {tx(TYPE_LABEL[type])}
          </MenuItem>
        ))}
      </Select>
      <Typography className="body-small-regular" color="var(--grey-400)">
        {tx('Excluded territories remain available in All territories.')}
      </Typography>
    </Stack>
  );
};
export default RecommendationSettings;
