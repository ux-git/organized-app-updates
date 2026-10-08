import { tx } from '@services/i18n/translation';
import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Box } from '@mui/material';
import { Navigate } from 'react-router';
import { Button, InfoNote } from '@components/index';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import {
  IconCheckCircle,
  IconClose,
  IconDelete,
  IconMoveBack,
  IconMoveForward,
  IconPrint,
  IconRaiseHand,
} from '@icons/index';
import { useBreakpoints, useCurrentUser } from '@hooks/index';
import { displaySnackNotification } from '@services/states/app';
import { currentPublisherState } from '@features/territories/assignees';
import useTerritoryDetails from '@features/territories/details/useTerritoryDetails';
import PageTitle from '@components/page_title';
import NavBarButton from '@components/nav_bar_button';
import NavBarButtonGroup from '@components/nav_bar_button_group';
import TerritoryDetailsContainer from '@features/territories/details';
import TerritoryDelete from '@features/territories/details/territory_delete';
import TerritoryExport from '@features/territories/details/territory_export';
import AssignReturnDialogs from '@features/territories/components/assign_return_dialogs';
import useAssignReturn from '@features/territories/useAssignReturn';
import useParentPage from '@features/territories/useParentPage';
import { territoryHolderText } from '@features/territories/group_holder';
import { Territory } from '@definition/territory';

const publisherNoteOf = (territory: Territory, me: string) => {
  if (territory.holder === me) {
    return tx('You are working this territory.');
  }
  if (territory.requestedBy === me) {
    return tx(
      'You asked for this territory. You will hear back when it is assigned.'
    );
  }
  if (territory.requestedBy) {
    return tx('Someone else has already asked for this territory.');
  }
  if (territory.status !== 'available') {
    return tx('This territory is being worked right now.');
  }
  return undefined;
};

const titleOf = (territory: Territory, isNew: boolean) =>
  isNew
    ? tx('New territory')
    : [tx('Territory {{number}}', { number: territory.number }), territory.name]
        .filter(Boolean)
        .join(' · ');

const TerritoryDetailsPage = () => {
  const { parent, goBack } = useParentPage();

  const [exportOpen, setExportOpen] = useState(false);
  const { tablet688Up } = useBreakpoints();

  const { isElder, isServiceCommittee } = useCurrentUser();
  const isTerritoryEditor = isElder || isServiceCommittee;

  const me = useAtomValue(currentPublisherState);

  const {
    territory,
    isNew,
    isNewPage,
    handleChange,
    commitNew,
    handleDelete,
    deleteOpen,
    setDeleteOpen,
    blocker,
  } = useTerritoryDetails();

  const actions = useAssignReturn();

  // the "new note" mark is for an editor who has not looked yet
  const unread = isTerritoryEditor && !!territory?.reviewNeeded;
  useEffect(() => {
    if (unread && territory)
      handleChange({ ...territory, reviewNeeded: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, territory?.id]);

  if (!territory) {
    return <InfoNote message={tx('This territory no longer exists.')} />;
  }

  // only those who manage territories add new ones
  if (isNew && !isTerritoryEditor) {
    return <Navigate to="/territories" replace />;
  }

  const requestedByMe = territory.requestedBy === me;
  const heldByMe = territory.holder === me;

  const canRequest = territory.status === 'available' && !territory.requestedBy;

  const isOut =
    territory.status === 'in_work' || territory.status === 'overdue';

  const returnButton = (
    <NavBarButton
      text={tx('Return')}
      icon={<IconMoveBack />}
      main
      onClick={() => actions.openReturn(territory.id)}
    />
  );

  const publisherNote = publisherNoteOf(territory, me);

  const setRequest = (requested: boolean) => {
    handleChange({
      ...territory,
      requestedBy: requested ? me : undefined,
    });

    displaySnackNotification({
      header: requested ? tx('Request sent') : tx('Request cancelled'),
      message: requested
        ? tx('You asked for territory {{number}}.', {
            number: territory.number,
          })
        : tx('Your request for territory {{number}} was withdrawn.', {
            number: territory.number,
          }),
      severity: 'success',
      icon: <IconCheckCircle color="var(--white)" />,
    });
  };

  const publisherButtons = (
    <NavBarButtonGroup>
      {requestedByMe && (
        <NavBarButton
          text={tx('Cancel request')}
          icon={<IconClose />}
          onClick={() => setRequest(false)}
        />
      )}
      {canRequest && (
        <NavBarButton
          text={tx('Request')}
          icon={<IconRaiseHand />}
          main
          onClick={() => setRequest(true)}
        />
      )}
      {heldByMe && returnButton}
    </NavBarButtonGroup>
  );

  // an empty group still draws the bar's backdrop
  const hasPublisherButtons = requestedByMe || canRequest || heldByMe;

  const editorButtons = !isNew && (
    <NavBarButtonGroup>
      <NavBarButton
        text={tx('Delete')}
        color="red"
        icon={<IconDelete />}
        onClick={() => setDeleteOpen(true)}
      />
      <NavBarButton
        text={tx('Print')}
        icon={<IconPrint />}
        onClick={() => setExportOpen(true)}
      />
      {isOut ? (
        returnButton
      ) : (
        <NavBarButton
          text={tx('Assign')}
          icon={<IconMoveForward />}
          main
          onClick={() => actions.openAssign(territory.id)}
        />
      )}
    </NavBarButtonGroup>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        paddingBottom: tablet688Up ? '0px' : '60px',
      }}
    >
      {exportOpen && (
        <TerritoryExport
          territory={territory}
          onClose={() => setExportOpen(false)}
        />
      )}

      <AssignReturnDialogs actions={actions} canAssign={isTerritoryEditor} />

      {blocker.state === 'blocked' && (
        <Dialog
          onClose={blocker.reset}
          open
          title={tx('Discard the new territory?')}
          description={tx(
            'It is saved once it has a number no other territory uses.'
          )}
        >
          <DialogActions>
            <Button variant="secondary" onClick={blocker.reset}>
              {tx('Keep editing')}
            </Button>
            <Button variant="main" color="red" onClick={blocker.proceed}>
              {tx('Discard')}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <TerritoryDelete
        open={deleteOpen}
        number={territory.number}
        holder={territoryHolderText(territory)}
        onClose={() => setDeleteOpen(false)}
        onDelete={handleDelete}
      />

      <PageTitle
        title={titleOf(territory, isNew)}
        secondaryTitle={parent && tx(parent)}
        onBack={goBack}
        buttons={
          isTerritoryEditor
            ? editorButtons || undefined
            : (hasPublisherButtons && publisherButtons) || undefined
        }
      />

      {!isTerritoryEditor && publisherNote && (
        <InfoNote message={publisherNote} />
      )}

      <TerritoryDetailsContainer
        territory={territory}
        onChange={handleChange}
        onCommit={commitNew}
        openOnDetails={isNewPage}
        readOnly={!isTerritoryEditor}
        showPrivate={isTerritoryEditor || heldByMe}
        heldByMe={heldByMe}
      />
    </Box>
  );
};

export default TerritoryDetailsPage;
