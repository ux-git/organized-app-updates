import { tx } from '@services/i18n/translation';
import { ReactNode, useRef, useState } from 'react';
import { Box, Stack } from '@mui/material';
import { ScrollableTabs, TextField, Typography } from '@components/index';
import Card from '@components/card';
import { useBreakpoints } from '@hooks/index';
import { DoNotCall, MAX_NOTE_LENGTH, Territory } from '@definition/territory';
import { daysLabel, withAssignments } from '../helpers';
import TerritorySummary from '../components/territory_summary';
import AssignedTwice from './assigned_twice';
import DetailsForm from './details_form';
import DoNotCallPanel from './do_not_call_panel';
import DoNotCallStrip from './do_not_call_strip';
import TerritoryAssignments from './territory_assignments';
import TerritoryMap from './territory_map';
import PhoneNumbersPanel from './phone_numbers_panel';
import TerritoryStats from './territory_stats';
import TerritoryStreets from './territory_streets';

type TerritoryDetailsProps = {
  territory: Territory;
  onChange: (territory: Territory) => void;
  // a new territory is saved once its number is typed in full
  onCommit?: VoidFunction;
  // a new territory starts where its number goes
  openOnDetails?: boolean;
  // publishers see the territory to decide on a request, but don't edit it
  readOnly?: boolean;
  // do-not-call addresses and phone numbers stay with admins and the holder
  showPrivate?: boolean;
  // the publisher working the territory adds the do-not-calls they meet
  heldByMe?: boolean;
};

type Section = { label: string; badge?: number; Component: ReactNode };

const TabbedSections = ({
  sections,
  start = 0,
}: {
  sections: Section[];
  start?: number;
}) => (
  <Box sx={{ '& [role="tabpanel"] > *': { padding: '16px 0 0' } }}>
    <ScrollableTabs
      appearance="plain"
      tabs={sections}
      value={start}
      sx={{ borderBottom: '1px solid var(--accent-200)' }}
    />
  </Box>
);

const TerritoryDetails = ({
  territory,
  onChange,
  onCommit,
  openOnDetails = false,
  readOnly = false,
  showPrivate = true,
  heldByMe = false,
}: TerritoryDetailsProps) => {
  const { desktopUp } = useBreakpoints();

  // kept from the first render, so saving the new territory doesn't switch tabs
  const [startOnDetails] = useState(openOnDetails);

  const doNotCallRef = useRef<HTMLDivElement>(null);

  const showDoNotCallList = () =>
    doNotCallRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

  const summary = (
    <>
      <TerritorySummary
        heading
        territory={territory}
        showDoNotCalls={showPrivate}
        onDoNotCalls={showDoNotCallList}
        meta={
          !readOnly && territory.holder
            ? `${territory.holder} · ${daysLabel(territory.daysOut)}`
            : undefined
        }
      />

      {territory.notes && (
        <Stack spacing="2px">
          <Typography className="body-small-semibold" color="var(--grey-400)">
            {tx('Notes')}
          </Typography>
          <Typography
            className="body-small-regular"
            color="var(--black)"
            sx={{ whiteSpace: 'pre-line' }}
          >
            {territory.notes}
          </Typography>
        </Stack>
      )}

      <TerritoryStats territory={territory} />

      {!readOnly && <AssignedTwice territory={territory} onChange={onChange} />}
    </>
  );

  // what this time brought: the holder writes it while out, editors too
  const open = territory.assignments.find(
    (item) => !item.returnedOn && item.publisher === territory.holder
  );

  const noteCard = open && (heldByMe || !readOnly) && (
    <Card>
      <Typography className="h2" color="var(--black)">
        {tx('Note')}
      </Typography>
      <TextField
        label={tx('Note')}
        placeholder={tx(
          'e.g. 5 Russian-speaking, 3 Ukrainian-speaking households'
        )}
        helperText={tx(
          'What was noticed this time. Stays with this assignment and is never printed.'
        )}
        multiline
        minRows={2}
        value={open.note ?? ''}
        slotProps={{ htmlInput: { maxLength: MAX_NOTE_LENGTH } }}
        onChange={(event) =>
          onChange({
            ...territory,
            assignments: territory.assignments.map((item) =>
              item.id === open.id
                ? { ...item, note: event.target.value || undefined }
                : item
            ),
          })
        }
      />
    </Card>
  );

  const form = (
    <DetailsForm
      key={territory.id}
      territory={territory}
      onChange={onChange}
      onCommit={onCommit}
    />
  );

  const isPhone = territory.type === 'phone';

  const changeDoNotCalls = (next: DoNotCall[]) =>
    onChange({ ...territory, doNotCalls: next });

  // right under the map, so nobody sets out without seeing them
  const doNotCallStrip = showPrivate && (
    <DoNotCallStrip territory={territory} onShow={showDoNotCallList} />
  );

  const mapContent = isPhone ? (
    <PhoneNumbersPanel
      territory={territory}
      onChange={(next) => onChange({ ...territory, phoneNumbers: next })}
    />
  ) : (
    <TerritoryMap territory={territory} />
  );

  const map = (
    <Stack spacing="12px">
      {mapContent}
      {doNotCallStrip}
      {!isPhone && <TerritoryStreets territory={territory} />}
    </Stack>
  );

  const mapLabel = isPhone ? tx('Phone numbers') : tx('Territory map');

  const assignments = (
    <TerritoryAssignments
      territory={territory}
      onChange={(next) => onChange(withAssignments(territory, next))}
      onNotes={(notes) => onChange({ ...territory, notes })}
    />
  );

  const doNotCalls = (
    <DoNotCallPanel territory={territory} onChange={changeDoNotCalls} />
  );

  const doNotCallCard = (content: ReactNode) => (
    // clears the fixed top bar when the strip scrolls here
    <Card ref={doNotCallRef} sx={{ scrollMarginTop: '96px' }}>
      <Typography className="h2" color="var(--black)">
        {tx('Do not call')}
      </Typography>
      {content}
    </Card>
  );

  if (readOnly) {
    const content = isPhone ? (
      showPrivate && (
        <PhoneNumbersPanel territory={territory} onChange={() => {}} readOnly />
      )
    ) : (
      <TerritoryMap
        territory={territory}
        readOnly
        showDoNotCalls={showPrivate}
      />
    );

    return (
      <Stack spacing="16px">
        <Card>
          {summary}

          <Stack spacing="12px">
            {content}
            {doNotCallStrip}
            {!isPhone && <TerritoryStreets territory={territory} />}
          </Stack>
        </Card>

        {noteCard}

        {showPrivate &&
          doNotCallCard(
            <DoNotCallPanel
              territory={territory}
              onChange={changeDoNotCalls}
              access={heldByMe ? 'own' : 'none'}
            />
          )}
      </Stack>
    );
  }

  if (!desktopUp) {
    return (
      <Stack spacing="16px">
        <Card>
          {summary}

          <TabbedSections
            start={startOnDetails ? 2 : 0}
            sections={[
              {
                label: isPhone ? tx('Phone numbers') : tx('Map'),
                Component: map,
              },
              { label: tx('Assignments'), Component: assignments },
              { label: tx('Details'), Component: form },
            ]}
          />
        </Card>

        {noteCard}

        {doNotCallCard(doNotCalls)}
      </Stack>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: '16px',
        alignItems: 'start',
      }}
    >
      <Stack spacing="16px">
        <Card>
          <Typography className="h2" color="var(--black)">
            {tx('Territory details')}
          </Typography>
          {form}
        </Card>

        {noteCard}

        {doNotCallCard(doNotCalls)}
      </Stack>

      <Card>
        {summary}

        <TabbedSections
          sections={[
            { label: mapLabel, Component: map },
            { label: tx('Assignments'), Component: assignments },
          ]}
        />
      </Card>
    </Box>
  );
};

export default TerritoryDetails;
