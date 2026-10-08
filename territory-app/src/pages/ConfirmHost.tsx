import { useEffect, useState } from 'react';
import Button from '@components/button';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { t } from '../i18n';

import { Ask, subscribeConfirmation } from './confirm';

export const ConfirmHost = () => {
  const [ask, setAsk] = useState<Ask | null>(null);
  // the question stays while the dialog fades out
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return subscribeConfirmation((next) => {
      setAsk(next);
      setOpen(true);
    });
  }, []);

  const answer = (ok: boolean) => {
    ask?.resolve(ok);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onClose={() => answer(false)}
      title={ask?.title}
      description={ask?.description}
    >
      <DialogActions>
        <Button variant="secondary" onClick={() => answer(false)}>
          {t('common.cancel')}
        </Button>
        <Button variant="main" color="red" onClick={() => answer(true)}>
          {ask?.action}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
