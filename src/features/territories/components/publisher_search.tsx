import { ReactNode } from 'react';
import { Box } from '@mui/material';
import { Typography } from '@components/index';
import Autocomplete from '@components/autocomplete';
import MenuSubHeader from '@components/menu_sub_header';
import { IconSearch } from '@icons/index';
import { matchesName } from '../name_search';
import { tx } from '@services/i18n/translation';

type PublisherSearchProps<T> = {
  // groups first, then publishers, so the sections stay together
  options: T[];
  value: T | null;
  onChange: (value: T | null) => void;
  getName: (option: T) => string;
  isGroup?: (option: T) => boolean;
  label?: string;
  autoFocus?: boolean;
  blurOnSelect?: boolean;
  inputValue?: string;
  onInputChange?: (value: string, reason: string) => void;
  // shown after the name, e.g. a count
  renderExtra?: (option: T) => ReactNode;
  noOptionsText?: ReactNode;
};

// a search field that picks a publisher or a group: typing narrows the list
// by any part of the name, Enter takes the first match
const PublisherSearch = <T,>({
  options,
  value,
  onChange,
  getName,
  isGroup,
  label = tx('Publisher'),
  autoFocus,
  blurOnSelect,
  inputValue,
  onInputChange,
  renderExtra,
  noOptionsText,
}: PublisherSearchProps<T>) => (
  <Autocomplete
    label={label}
    placeholder={tx('Search publishers…')}
    startIcon={<IconSearch color="var(--grey-350)" />}
    autoFocus={autoFocus}
    autoHighlight
    blurOnSelect={blurOnSelect}
    options={options}
    value={value}
    inputValue={inputValue}
    onInputChange={
      onInputChange && ((_, next, reason) => onInputChange(next, reason))
    }
    onChange={(_, next) => onChange(next as T | null)}
    filterOptions={(items, { inputValue: query }) =>
      items.filter((item) => matchesName(getName(item as T), query))
    }
    getOptionLabel={(option) => getName(option as T)}
    isOptionEqualToValue={(option, chosen) =>
      getName(option as T) === getName(chosen as T)
    }
    groupBy={
      isGroup &&
      ((option) => (isGroup(option as T) ? tx('Groups') : tx('Publishers')))
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
          {getName(option as T)}
        </Typography>
        {renderExtra?.(option as T)}
      </Box>
    )}
    noOptionsText={noOptionsText}
  />
);

export default PublisherSearch;
