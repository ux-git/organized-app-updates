import useLocalOnlyCleanup from './useLocalOnlyCleanup';
import CleanupDialog from './cleanup_dialog';

const LocalOnlyCleanup = () => {
  const { open, leftovers, handleLater, handleRemoved } = useLocalOnlyCleanup();

  if (!open) return null;

  return (
    <CleanupDialog
      leftovers={leftovers}
      onLater={handleLater}
      onRemoved={handleRemoved}
    />
  );
};

export default LocalOnlyCleanup;
