import { useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Badge } from '@components/index';
import { territoriesWithStatusState } from '@states/territories';
import { territoryAssigneesState } from '../assignees';
import { HolderOption, holderOptions } from '../holder_filter';
import PublisherSearch from './publisher_search';
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
    <PublisherSearch
      label={tx('Find a publisher or group')}
      options={options}
      value={null}
      inputValue={input}
      blurOnSelect
      onInputChange={(value, reason) =>
        setInput(reason === 'input' ? value : '')
      }
      onChange={(option) => {
        if (option) onPick(option);
      }}
      getName={(option) => option.name}
      isGroup={(option) => option.isGroup}
      renderExtra={(option) => (
        <Badge
          size="small"
          filled={false}
          color={option.count > 0 ? 'accent' : 'grey'}
          text={String(option.count)}
          sx={{ width: 'fit-content', flexShrink: 0 }}
        />
      )}
    />
  );
};

export default HolderPicker;
