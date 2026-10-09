import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAtom } from 'jotai';
import { Button, TextField } from '@components/index';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import { territoriesState } from '@states/territories';
import { tx } from '@services/i18n/translation';
import { blankTerritory, usableNumber } from '../details/useTerritoryDetails';

// a territory started from the map: number and locality first, then
// straight to drawing its border
const NewTerritoryDialog = ({ onClose }: { onClose: VoidFunction }) => {
  const navigate = useNavigate();
  const [territories, setTerritories] = useAtom(territoriesState);
  const [draft, setDraft] = useState(blankTerritory);
  const [tried, setTried] = useState(false);

  const usable = usableNumber(draft, territories);
  const isDuplicate = !!draft.number.trim() && !usable;

  let numberHelp = '';
  if (isDuplicate) numberHelp = tx('This number is already used');
  else if (tried && !usable) numberHelp = tx('Enter a number');

  const start = () => {
    setTried(true);
    if (!usable) return;

    const territory = {
      ...draft,
      number: draft.number.trim(),
      city: draft.city.trim(),
    };
    setTerritories((prev) => [territory, ...prev]);
    navigate(`/territories/map?territory=${territory.id}&edit=1`);
  };

  return (
    <Dialog
      onClose={onClose}
      open
      title={tx('New territory with map')}
      description={tx('Give it a number and a locality, then draw its border.')}
    >
      <TextField
        label={tx('Number')}
        autoFocus
        value={draft.number}
        error={isDuplicate || (tried && !usable)}
        helperText={numberHelp}
        onChange={(event) => setDraft({ ...draft, number: event.target.value })}
        onKeyDown={(event) => event.key === 'Enter' && start()}
      />

      <TextField
        label={tx('Locality')}
        value={draft.city}
        onChange={(event) => setDraft({ ...draft, city: event.target.value })}
        onKeyDown={(event) => event.key === 'Enter' && start()}
      />

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button variant="main" onClick={start}>
          {tx('Draw border')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewTerritoryDialog;
