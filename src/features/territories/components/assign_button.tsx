import { MouseEvent, useState } from 'react';
import { Box } from '@mui/material';
import { Button } from '@components/index';
import { IconArrowForward, IconCheck, IconRaiseHand } from '@icons/index';
import ReviewDialog from './review_dialog';
import { Territory } from '@definition/territory';
import { tx } from '@services/i18n/translation';

type AssignButtonProps = {
  territory: Territory;
  onOpenAssign: (id: string) => void;
  onDecline: (id: string) => void;
  onReturn: (id: string) => void;
  compact?: boolean;
};

const LABELS = ['Return', 'Review', 'Assign'];

const lookOf = (isAssigned: boolean, isRequested: boolean) => {
  if (isAssigned) {
    return {
      label: 'Return',
      color: 'red' as const,
      icon: <IconCheck color="var(--red-dark)" />,
    };
  }

  if (isRequested) {
    return {
      label: 'Review',
      color: 'orange' as const,
      icon: <IconRaiseHand color="var(--orange-dark)" />,
    };
  }

  return {
    label: 'Assign',
    color: undefined,
    icon: <IconArrowForward color="var(--accent-dark)" />,
  };
};

const AssignButton = ({
  territory,
  onOpenAssign,
  onDecline,
  onReturn,
  compact = false,
}: AssignButtonProps) => {
  const [reviewOpen, setReviewOpen] = useState(false);

  const isAssigned =
    territory.status === 'in_work' || territory.status === 'overdue';

  const isRequested = Boolean(territory.requestedBy);

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();

    if (isAssigned) {
      onReturn(territory.id);
      return;
    }

    if (isRequested) {
      setReviewOpen(true);
      return;
    }

    onOpenAssign(territory.id);
  };

  const { label, color, icon } = lookOf(isAssigned, isRequested);

  return (
    <>
      {reviewOpen && (
        <Box onClick={(event) => event.stopPropagation()}>
          <ReviewDialog
            territory={territory}
            onClose={() => setReviewOpen(false)}
            onAssign={onOpenAssign}
            onDecline={onDecline}
          />
        </Box>
      )}

      <Button
        variant="small"
        disableAutoStretch
        color={color}
        onClick={handleClick}
        startIcon={icon}
        ariaLabel={tx(label)}
        sx={{
          minHeight: '28px',
          padding: compact ? '4px' : '2px 8px',
          minWidth: 'unset',
          justifyContent: 'flex-start',
          '& .MuiButton-startIcon': compact ? { margin: 0 } : {},
          // 28px to see, 44px to tap
          '&::after': { content: '""', position: 'absolute', inset: '-8px' },
        }}
      >
        {!compact && (
          // every label stacked in one cell, so all buttons share the widest width
          <Box sx={{ display: 'grid', textAlign: 'start' }}>
            {LABELS.map((text) => (
              <Box
                key={text}
                component="span"
                aria-hidden={text !== label}
                sx={{
                  gridArea: '1 / 1',
                  visibility: text === label ? 'visible' : 'hidden',
                }}
              >
                {tx(text)}
              </Box>
            ))}
          </Box>
        )}
      </Button>
    </>
  );
};

export default AssignButton;
