import { Stack } from '@mui/material';
import { Button, Typography } from '@components/index';
import { useBreakpoints } from '@hooks/index';
import { Territory } from '@definition/territory';
import { tx } from '@services/i18n/translation';
import { selectionActions } from './selection_actions';

type SelectionBarProps = {
  selected: Territory[];
  onAssignMany: VoidFunction;
  onReturnMany: VoidFunction;
  onClear: VoidFunction;
};

const SelectionBar = ({
  selected,
  onAssignMany,
  onReturnMany,
  onClear,
}: SelectionBarProps) => {
  const { tablet600Up } = useBreakpoints();
  if (!selected.length) return null;
  const button = {
    minHeight: tablet600Up ? '32px' : '40px',
    padding: '0 var(--radius-l)',
    minWidth: 0,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  };
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        flexWrap: 'wrap',
        width: tablet600Up ? 'fit-content' : '100%',
        borderRadius: 'var(--radius-l)',
        backgroundColor: 'var(--accent-100)',
      }}
    >
      {tablet600Up && (
        <Typography
          className="body-small-semibold"
          color="var(--accent-400)"
          sx={{ padding: '0 var(--radius-l)', whiteSpace: 'nowrap' }}
        >
          {tx('Selected: {{n}}', { n: selected.length })}
        </Typography>
      )}
      {selectionActions(selected).map(({ kind, count }) => (
        <Button
          key={kind}
          variant="small"
          disableAutoStretch
          color={kind === 'return' ? 'red' : undefined}
          onClick={kind === 'assign' ? onAssignMany : onReturnMany}
          sx={button}
        >
          {tx(kind === 'assign' ? 'Assign: {{n}}' : 'Return: {{n}}', {
            n: count,
          })}
        </Button>
      ))}
      <Button variant="small" disableAutoStretch onClick={onClear} sx={button}>
        {tx('Deselect all')}
      </Button>
    </Stack>
  );
};
export default SelectionBar;
