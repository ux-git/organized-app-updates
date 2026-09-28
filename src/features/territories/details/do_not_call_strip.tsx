import { tx } from '@services/i18n/translation';
import { ButtonBase } from '@mui/material';
import { Badge, Typography } from '@components/index';
import { IconCancelCicle, IconChevronRight } from '@icons/index';
import { Territory } from '@definition/territory';
import { doNotCallLabel } from '../helpers';

const shortLabel = (count: number, isPhone: boolean) => {
  if (isPhone) {
    return count === 1
      ? tx('{{n}} number', { n: count })
      : tx('{{n}} numbers', { n: count });
  }

  return count === 1
    ? tx('{{n}} address', { n: count })
    : tx('{{n}} addresses', { n: count });
};

// the do-not-call card lower down lists them and has the one Add
const DoNotCallStrip = ({
  territory,
  onShow,
}: {
  territory: Territory;
  onShow: VoidFunction;
}) => {
  const count = territory.doNotCalls.length;
  const isPhone = territory.type === 'phone';

  if (count === 0) return null;

  return (
    <ButtonBase
      disableRipple
      aria-label={doNotCallLabel(count, isPhone)}
      onClick={onShow}
      sx={{
        minHeight: '40px',
        justifyContent: 'flex-start',
        gap: '8px',
        padding: '4px 12px',
        borderRadius: 'var(--radius-l)',
        backgroundColor: 'var(--red-secondary)',
        '&:focus-visible': { outline: 'var(--red-main) auto 1px' },
      }}
    >
      <Badge
        size="small"
        color="red"
        filled
        text={tx('Do not call')}
        icon={<IconCancelCicle color="var(--always-white)" />}
        sx={{ width: 'fit-content', flexShrink: 0 }}
      />
      <Typography
        className="body-small-semibold"
        color="var(--red-dark)"
        noWrap
      >
        {shortLabel(count, isPhone)}
      </Typography>
      <IconChevronRight
        color="var(--red-dark)"
        width={20}
        height={20}
        sx={{ flexShrink: 0, marginLeft: 'auto' }}
      />
    </ButtonBase>
  );
};

export default DoNotCallStrip;
