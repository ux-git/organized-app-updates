import { FormControlLabel, RadioGroup, Stack } from '@mui/material';
import { Radio, Typography } from '@components/index';
import { IconPhone, IconPrint } from '@icons/index';
import { AssignmentCard, CARD_LABEL } from '@definition/territory';
import { tx } from '@services/i18n/translation';

const ICONS = { digital: IconPhone, printed: IconPrint };

// Digital or printed card; neither ticked while an older record has no say
const CardField = ({
  value,
  helper,
  onChange,
}: {
  value?: AssignmentCard;
  helper: string;
  onChange: (next: AssignmentCard) => void;
}) => (
  <Stack spacing="2px" sx={{ width: '100%' }}>
    <RadioGroup
      row
      aria-label={tx('Card')}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value as AssignmentCard)}
      sx={{ gap: '0 16px' }}
    >
      {(Object.keys(CARD_LABEL) as AssignmentCard[]).map((card) => {
        const Icon = ICONS[card];

        return (
          <FormControlLabel
            key={card}
            value={card}
            control={<Radio />}
            label={
              <Stack
                direction="row"
                spacing="6px"
                sx={{ alignItems: 'center' }}
              >
                <Icon color="var(--grey-400)" width={18} height={18} />
                <Typography>{tx(CARD_LABEL[card])}</Typography>
              </Stack>
            }
          />
        );
      })}
    </RadioGroup>
    <Typography className="label-small-regular" color="var(--grey-350)">
      {helper}
    </Typography>
  </Stack>
);

export default CardField;
