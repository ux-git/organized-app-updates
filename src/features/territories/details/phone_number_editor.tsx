import { tx } from '@services/i18n/translation';
import { useState } from 'react';
import { Button, TextField } from '@components/index';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import EditorHeader from './editor_header';

const PhoneNumberEditor = ({
  value,
  onClose,
  onSave,
  onDelete,
}: {
  value?: string;
  onClose: VoidFunction;
  onSave: (next: string) => void;
  onDelete?: VoidFunction;
}) => {
  const [number, setNumber] = useState(value ?? '');

  return (
    <Dialog
      onClose={onClose}
      open
      header={
        <EditorHeader
          title={
            value === undefined
              ? tx('Add phone number')
              : tx('Edit phone number')
          }
          description={tx(
            'A number the publishers call when they work this territory.'
          )}
          onDelete={
            value !== undefined && onDelete
              ? () => {
                  onDelete();
                  onClose();
                }
              : undefined
          }
        />
      }
    >
      <TextField
        label={tx('Phone number')}
        type="tel"
        autoFocus
        value={number}
        onChange={(event) => setNumber(event.target.value)}
      />

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          disabled={!number.trim()}
          onClick={() => {
            onSave(number.trim());
            onClose();
          }}
        >
          {tx('Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PhoneNumberEditor;
