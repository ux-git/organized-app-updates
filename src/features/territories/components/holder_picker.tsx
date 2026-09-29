import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { useAtomValue } from 'jotai';
import { Badge, Typography } from '@components/index';
import Autocomplete from '@components/autocomplete';
import MenuSubHeader from '@components/menu_sub_header';
import { IconSearch } from '@icons/index';
import { territoriesWithStatusState } from '@states/territories';
import { territoryAssigneesState } from '../assignees';
import { HolderOption, holderOptions } from '../holder_filter';
import { tx } from '@services/i18n/translation';

// a search field that picks a name; the chosen one shows as a chip beside it
const HolderPicker = ({
  onPick,
}: {
  onPick: (option: HolderOption) => void;
}) => {
  const territories = useAtomValue(territoriesWithStatusState);
  const assignees = useAtomValue(territoryAssigneesState);

  const [input, setInput] = useState('');

  const options = useMemo(
    () =>
      holderOptions(
        territories,
        assignees.filter((assignee) => assignee.group).map(({ name }) => name)
      ),
    [territories, assignees]
  );

  return (
    <Autocomplete
      label={tx('Find a publisher or group')}
      startIcon={<IconSearch />}
      options={options}
      value={null}
      inputValue={input}
      blurOnSelect
      onInputChange={(_, value, reason) =>
        setInput(reason === 'input' ? value : '')
      }
      onChange={(_, option) => {
        if (option) onPick(option as HolderOption);
      }}
      getOptionLabel={(option) => (option as HolderOption).name}
      isOptionEqualToValue={(option, value) =>
        (option as HolderOption).name === (value as HolderOption).name
      }
      groupBy={(option) =>
        (option as HolderOption).isGroup ? tx('Groups') : tx('Publishers')
      }
      renderGroup={(params) => (
        <li key={params.key}>
          <MenuSubHeader>{params.group}</MenuSubHeader>
          <Box component="ul" sx={{ padding: 0 }}>
            {params.children}
          </Box>
        </li>
      )}
      renderOption={({ key, ...props }, option) => (
        <Box component="li" key={key} {...props} sx={{ gap: '8px' }}>
          <Typography className="body-regular" sx={{ flexGrow: 1 }}>
            {(option as HolderOption).name}
          </Typography>
          <Badge
            size="small"
            filled={false}
            color={(option as HolderOption).count > 0 ? 'accent' : 'grey'}
            text={String((option as HolderOption).count)}
            sx={{ width: 'fit-content', flexShrink: 0 }}
          />
        </Box>
      )}
    />
  );
};

export default HolderPicker;
