import { FormControlLabel, RadioGroup } from '@mui/material';
import { Radio, Typography } from '@components/index';
import { AssignmentCard, CARD_LABEL } from '@definition/territory';
import { tx } from '@services/i18n/translation';

// Digital or printed card; neither ticked while an older record has no say
const CardField = ({
  value,
  onChange,
}: {
  value?: AssignmentCard;
  onChange: (next: AssignmentCard) => void;
}) => (
  <RadioGroup
    row
    aria-label={tx('Card')}
    value={value ?? ''}
    onChange={(event) => onChange(event.target.value as AssignmentCard)}
    sx={{ gap: '0 16px', width: '100%' }}
  >
    {(Object.keys(CARD_LABEL) as AssignmentCard[]).map((card) => (
      <FormControlLabel
        key={card}
        value={card}
        control={<Radio />}
        label={<Typography>{tx(CARD_LABEL[card])}</Typography>}
      />
    ))}
  </RadioGroup>
);

export default CardField;
