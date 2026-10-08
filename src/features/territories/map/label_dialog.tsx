import { useState } from 'react';
import { Button, TextField } from '@components/index';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { tx } from '@services/i18n/translation';

const LabelDialog = ({
  initial = '',
  onSave,
  onClose,
}: {
  initial?: string;
  onSave: (text: string) => void;
  onClose: VoidFunction;
}) => {
  const [text, setText] = useState(initial);

  return (
    <Dialog
      onClose={onClose}
      open
      title={initial ? tx('Edit text') : tx('Add text')}
      description={tx(
        'The note is printed on the territory card together with the map.'
      )}
    >
      <TextField
        label={tx('Text')}
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
      />

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          disabled={!text.trim()}
          onClick={() => onSave(text)}
        >
          {tx('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LabelDialog;
