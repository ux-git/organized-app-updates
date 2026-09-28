import { forwardRef } from 'react';
import { Stack } from '@mui/material';
import { Button, Typography } from '@components/index';
import { IconClose, IconSave } from '@icons/index';
import { tx } from '@services/i18n/translation';
import { MapTool } from './useMapEditor';

// short enough for one line on a phone; the panel keeps the longer ones
const HINT: Record<MapTool, string> = {
  border: 'Tap the map to set the corners.',
  points: 'Drag the corners to change the border.',
  move: 'Drag an item to move it.',
  text: 'Tap where the note goes.',
  pin: 'Tap where the pin goes.',
  line: 'Tap to add bends, twice to finish.',
  shape: 'Tap the corners, then the first one.',
};

// on a phone the panel with Save stays folded away while drawing
const EditBar = forwardRef<
  HTMLDivElement,
  {
    tool: MapTool;
    canSave: boolean;
    onCancel: VoidFunction;
    onSave: VoidFunction;
  }
>(({ tool, canSave, onCancel, onSave }, ref) => (
  <Stack
    ref={ref}
    spacing="8px"
    sx={{
      alignSelf: 'stretch',
      padding: '12px',
      borderRadius: 'var(--radius-l)',
      backgroundColor: 'var(--white)',
      border: '1px solid var(--accent-200)',
      boxShadow: 'var(--hover-shadow)',
    }}
  >
    <Typography className="body-small-regular" color="var(--grey-400)" noWrap>
      {tx(HINT[tool])}
    </Typography>

    <Stack direction="row" spacing="8px">
      <Button
        variant="secondary"
        startIcon={<IconClose />}
        onClick={onCancel}
        sx={{ flex: 1 }}
      >
        {tx('Cancel')}
      </Button>
      <Button
        variant="main"
        startIcon={<IconSave />}
        disabled={!canSave}
        onClick={onSave}
        sx={{ flex: 1 }}
      >
        {tx('Save')}
      </Button>
    </Stack>
  </Stack>
));

EditBar.displayName = 'EditBar';

export default EditBar;
