import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAtom } from 'jotai';
import { territoriesState } from '@states/territories';
import { Territory } from '@definition/territory';

const blankTerritory = (): Territory => ({
  id: `t-${Date.now()}`,
  number: '',
  name: '',
  city: '',
  type: 'door_to_door',
  status: 'available',
  categories: [],
  cardLost: false,
  daysSinceCovered: 0,
  households: 0,
  doNotCalls: [],
  assignments: [],
});

const useTerritoryDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [territories, setTerritories] = useAtom(territoriesState);

  const isNewPage = id === 'new';

  const [draft, setDraft] = useState(() => blankTerritory());
  const [deleteOpen, setDeleteOpen] = useState(false);

  // once saved, a new territory stays on this page, so nothing remounts under the typing
  const stored = territories.find(
    (item) => item.id === (isNewPage ? draft.id : id)
  );

  const isNew = isNewPage && !stored;

  const territory = isNew ? draft : stored;

  const handleChange = (next: Territory) => {
    if (isNew) {
      setDraft(next);
      return;
    }

    setTerritories((prev) =>
      prev.map((item) => (item.id === next.id ? next : item))
    );
  };

  const latest = useRef({ isNew, draft, territories });
  latest.current = { isNew, draft, territories };

  // saved when its number is typed in full and usable; every later change saves at once
  const commitNew = useCallback(() => {
    const { isNew: pending, draft: next, territories: list } = latest.current;
    if (!pending) return;

    const number = next.number.trim();
    if (!number || list.some((item) => item.number.trim() === number)) return;

    setTerritories((prev) => [next, ...prev]);
  }, [setTerritories]);

  // leaving the page counts as done typing
  useEffect(() => commitNew, [commitNew]);

  // once saved, the address names it, so a reload opens it; the router isn't told, or the
  // page would remount under the typing
  const savedId = isNewPage ? stored?.id : undefined;
  useEffect(() => {
    if (!savedId) return;
    const url = window.location.href.replace(
      /territories\/new(?=[/?#]|$)/,
      `territories/${encodeURIComponent(savedId)}`
    );
    if (url !== window.location.href) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [savedId]);

  const handleDelete = () => {
    if (!territory) return;

    setTerritories((prev) => prev.filter((item) => item.id !== territory.id));
    setDeleteOpen(false);
    navigate('/territories');
  };

  return {
    territory,
    isNew,
    isNewPage,
    handleChange,
    commitNew,
    handleDelete,
    deleteOpen,
    setDeleteOpen,
  };
};

export default useTerritoryDetails;
