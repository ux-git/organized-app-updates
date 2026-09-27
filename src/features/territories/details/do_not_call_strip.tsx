import { tx } from '@services/i18n/translation';
import { useState } from 'react';
import { ButtonBase, Stack } from '@mui/material';
import { Badge, Button, Typography } from '@components/index';
import { IconAdd, IconCancelCicle, IconChevronRight } from '@icons/index';
import { DoNotCall, Territory } from '@definition/territory';
import { isDoNotCallNumber, upsertById } from '../helpers';
import DoNotCallEditor from './do_not_call_editor';

const DoNotCallStrip = ({
  territory,
  canAdd,
  onShow,
  onChange,
}: {
  territory: Territory;
  canAdd: boolean;
  onShow: VoidFunction;
  onChange: (entries: DoNotCall[]) => void;
}) => {
  const [adding, setAdding] = useState(false);

  const count = territory.doNotCalls.length;
  const isPhone = territory.type === 'phone';

  const [one, many] = isPhone
    ? [tx('Do-not-call number'), tx('Do-not-call numbers')]
    : [tx('Do-not-call address'), tx('Do-not-call addresses')];

  const add = canAdd && (
    <Button
      variant="small"
      disableAutoStretch
      startIcon={<IconAdd color="var(--accent-main)" />}
      onClick={() => setAdding(true)}
      sx={{ minHeight: '32px', minWidth: 'unset', flexShrink: 0 }}
    >
      {count > 0 ? tx('Add') : tx('Add do-not-call')}
    </Button>
  );

  const editor = adding && (
    <DoNotCallEditor
      numbers={
        isPhone
          ? (territory.phoneNumbers ?? []).filter(
              (number) => !isDoNotCallNumber(territory, number)
            )
          : undefined
      }
      onClose={() => setAdding(false)}
      onSave={(next) => onChange(upsertById(territory.doNotCalls, next))}
    />
  );

  // with none, the do-not-call card lower down has its own Add
  if (count === 0) return null;

  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        gap: '8px',
        padding: '4px',
        borderRadius: 'var(--radius-l)',
        backgroundColor: 'var(--red-secondary)',
      }}
    >
      <ButtonBase
        disableRipple
        onClick={onShow}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          minHeight: '32px',
          justifyContent: 'flex-start',
          gap: '8px',
          padding: '0 8px',
          borderRadius: 'var(--radius-m)',
          '&:focus-visible': { outline: 'var(--red-main) auto 1px' },
        }}
      >
        <Badge
          size="small"
          color="red"
          filled
          text={String(count)}
          icon={<IconCancelCicle color="var(--always-white)" />}
          sx={{ width: 'fit-content', flexShrink: 0 }}
        />
        <Typography
          className="body-small-semibold"
          color="var(--red-dark)"
          noWrap
        >
          {count === 1 ? one : many}
        </Typography>
        <IconChevronRight
          color="var(--red-dark)"
          width={20}
          height={20}
          sx={{ flexShrink: 0, marginLeft: 'auto' }}
        />
      </ButtonBase>

      {add}
      {editor}
    </Stack>
  );
};

export default DoNotCallStrip;
