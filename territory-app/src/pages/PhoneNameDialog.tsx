import { useEffect, useState } from 'react';
import Button from '@components/button';
import Dialog from '@components/dialog';
import TextField from '@components/textfield';
import { invoke } from '../native';
import { loadIdentity } from '../persistence';

/** The name paired phones show for this one. */
const PhoneNameDialog = ({
  open,
  name,
  onClose,
}: {
  open: boolean;
  name: string;
  onClose: VoidFunction;
}) => {
  const [value, setValue] = useState(name);

  useEffect(() => {
    if (open) setValue(name);
  }, [open, name]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    await invoke('set_name', { name: trimmed });
    await loadIdentity();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Your name"
      description="Paired phones show this name, and it is filled in when you add a do-not-call address. They get the new name at the next sync."
    >
      <TextField
        label="First and last name"
        value={value}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && save()}
      />
      <Button variant="main" disabled={!value.trim()} onClick={save}>
        Save
      </Button>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </Dialog>
  );
};

export default PhoneNameDialog;
