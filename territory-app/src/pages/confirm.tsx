import { useEffect, useState } from 'react';
import Button from '@components/button';
import Dialog from '@components/dialog';

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

  useEffect(() => {
    show = setAsk;
    return () => {
      show = undefined;
    };
  }, []);

  const answer = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(null);
  };

  return (
    <Dialog
      open={!!ask}
      onClose={() => answer(false)}
      title={ask?.title}
      description={ask?.description}
    >
      <Button variant="main" color="red" onClick={() => answer(true)}>
        {ask?.action}
      </Button>
      <Button variant="secondary" onClick={() => answer(false)}>
        Cancel
      </Button>
    </Dialog>
  );
};
