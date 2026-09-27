import { useEffect, useState } from 'react';
import Button from '@components/button';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { t } from '../i18n';

type Ask = {
  title: string;
  description: string;
  action: string;
  resolve: (ok: boolean) => void;
};

let show: ((ask: Ask) => void) | undefined;

/**
 * The app's own dialog for a yes/no question. The WebView's window.confirm
 * draws Android's oldest dialog style.
 */
export const confirm = (question: Omit<Ask, 'resolve'>) =>
  new Promise<boolean>((resolve) => {
    if (!show) return resolve(window.confirm(question.description));
    show({ ...question, resolve });
  });

export const ConfirmHost = () => {
  const [ask, setAsk] = useState<Ask | null>(null);
  // the question stays while the dialog fades out
  const [open, setOpen] = useState(false);

  useEffect(() => {
    show = (next) => {
      setAsk(next);
      setOpen(true);
    };
    return () => {
      show = undefined;
    };
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
