import { tx } from '@services/i18n/translation';
import { ReactNode, useRef } from 'react';
import { Box, Stack } from '@mui/material';
import { ScrollableTabs, Typography } from '@components/index';
import Card from '@components/card';
import { useBreakpoints } from '@hooks/index';
import { DoNotCall, Territory } from '@definition/territory';
import { daysLabel, withAssignments } from '../helpers';
import TerritorySummary from '../components/territory_summary';
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
  // publishers see the territory to decide on a request, but don't edit it
  readOnly?: boolean;
  // do-not-call addresses and phone numbers stay with admins and the holder
  showPrivate?: boolean;
  // the publisher working the territory adds the do-not-calls they meet
  heldByMe?: boolean;
};

type Section = { label: string; badge?: number; Component: ReactNode };

const TabbedSections = ({ sections }: { sections: Section[] }) => (
  <Box sx={{ '& [role="tabpanel"] > *': { padding: '16px 0 0' } }}>
    <ScrollableTabs
      appearance="plain"
      tabs={sections}
      value={0}
      sx={{ borderBottom: '1px solid var(--accent-200)' }}
    />
  </Box>
);

const TerritoryDetails = ({
  territory,
  onChange,
  readOnly = false,
  showPrivate = true,
  heldByMe = false,
}: TerritoryDetailsProps) => {
  const { desktopUp } = useBreakpoints();

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

      <TerritoryStats territory={territory} showDoNotCalls={showPrivate} />
    </>
  );

  const form = (
    <DetailsForm key={territory.id} territory={territory} onChange={onChange} />
  );

  const isPhone = territory.type === 'phone';

  const changeDoNotCalls = (next: DoNotCall[]) =>
    onChange({ ...territory, doNotCalls: next });

  // right under the map, so nobody sets out without seeing them
  const doNotCallStrip = showPrivate && (
    <DoNotCallStrip
      territory={territory}
      canAdd={!readOnly || heldByMe}
      onShow={showDoNotCallList}
      onChange={changeDoNotCalls}
    />
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
