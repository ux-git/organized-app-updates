import { tx } from '@services/i18n/translation';
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { shortDateFormatState } from '@states/settings';
import { Box, Stack } from '@mui/material';
import { Button } from '@components/index';
import { useBreakpoints } from '@hooks/index';
import { IconAdd, IconCopy, IconEdit } from '@icons/index';
import { Territory, TerritoryAssignment } from '@definition/territory';
import RecordList from '../components/record_list';
import RowAction from '../components/row_action';
import {
  CampaignBadge,
  CardBadge,
  StatusBadge,
} from '../components/territory_badges';
import {
  assignmentFromDates,
  assignmentIssues,
  displayDate,
  issuesText,
  parseDate,
  emptyListMessage,
} from '../helpers';
import { appendNote, noteLine } from '../notes';
import { holderText, missingPublisher } from '../group_holder';
import { offerUndo } from '../undo';
import { restoreAssignment } from '../restore';
import AssignmentEditor from './assignment_editor';

const newestFirst = (a: TerritoryAssignment, b: TerritoryAssignment) =>
  (parseDate(b.assignedOn)?.getTime() ?? 0) -
  (parseDate(a.assignedOn)?.getTime() ?? 0);

const blankAssignment = (): TerritoryAssignment =>
  assignmentFromDates(
    {
      id: `ta-${Date.now()}`,
      publisher: '',
      assignedOn: '',
      months: 0,
      serviceYear: 0,
      startMonth: 0,
      endMonth: 0,
    },
    '',
    new Date(),
    null
  );

const TerritoryAssignments = ({
  territory,
  onChange,
  onNotes,
}: {
  territory: Territory;
  onChange?: (assignments: TerritoryAssignment[]) => void;
  // a note worth keeping goes into the territory's notes
  onNotes?: (notes: string) => void;
}) => {
  const { tablet688Up } = useBreakpoints();

  const format = useAtomValue(shortDateFormatState);

  const [editing, setEditing] = useState<TerritoryAssignment>();
  const [adding, setAdding] = useState(false);

  const assignments = territory.assignments;

  const adoptable = (note?: string) =>
    !!onNotes && !!note?.trim() && !territory.notes?.includes(note.trim());

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <RecordList
        emptyMessage={emptyListMessage()}
        items={[...assignments].sort(newestFirst).map((assignment) => ({
          id: assignment.id,
          onClick: onChange && (() => setEditing(assignment)),
          title: holderText(assignment),
          subtitle: assignment.note ? noteLine(assignment.note) : undefined,
          date: assignment.returnedOn
            ? `${displayDate(assignment.assignedOn, format)} – ${displayDate(assignment.returnedOn, format)}`
            : tx('Since: {{date}}', {
                date: displayDate(assignment.assignedOn, format),
              }),
          warning: [
            missingPublisher(assignment) && tx('Fill in who took it'),
            issuesText(assignmentIssues(assignment)),
          ]
            .filter(Boolean)
            .join(' · '),
          badge: (!assignment.returnedOn ||
            assignment.campaign ||
            assignment.card) && (
            <Stack direction="row" spacing="4px" sx={{ flexShrink: 0 }}>
              {!assignment.returnedOn && <StatusBadge status="in_work" />}
              <CardBadge card={assignment.card} text={tablet688Up} />
              <CampaignBadge assignment={assignment} />
            </Stack>
          ),
          actions: (onChange || adoptable(assignment.note)) && (
            <>
              {adoptable(assignment.note) && (
                <RowAction
                  title={tx('Add to territory notes')}
                  onClick={() =>
                    onNotes?.(appendNote(territory.notes, assignment.note!))
                  }
                >
                  <IconCopy color="var(--accent-main)" width={18} height={18} />
                </RowAction>
              )}
              {onChange && (
                <RowAction
                  title={tx('Edit')}
                  onClick={() => setEditing(assignment)}
                >
                  <IconEdit color="var(--accent-main)" width={18} height={18} />
                </RowAction>
              )}
            </>
          ),
        }))}
      />

      {onChange && (
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <Button
            variant="small"
            disableAutoStretch
            startIcon={<IconAdd color="var(--accent-main)" />}
            onClick={() => {
              setEditing(blankAssignment());
              setAdding(true);
            }}
            sx={{ minHeight: '32px', minWidth: 'unset' }}
          >
            {tx('Add')}
          </Button>
        </Stack>
      )}

      {editing && onChange && (
        <AssignmentEditor
          assignment={editing}
          isNew={adding}
          otherOpen={assignments.some(
            (item) => item.id !== editing.id && !item.returnedOn
          )}
          onClose={() => {
            setEditing(undefined);
            setAdding(false);
          }}
          onDelete={() => {
            const index = assignments.findIndex(
              (item) => item.id === editing.id
            );
            onChange(assignments.filter((item) => item.id !== editing.id));
            offerUndo({
              text: tx('Assignment deleted'),
              revert: () => restoreAssignment(territory.id, editing, index),
            });
          }}
          onAdoptNote={
            adoptable(editing.note)
              ? () => onNotes?.(appendNote(territory.notes, editing.note!))
              : undefined
          }
          onSave={(next) =>
            onChange(
              adding
                ? [...assignments, next]
                : assignments.map((item) => (item.id === next.id ? next : item))
            )
          }
        />
      )}
    </Box>
  );
};

export default TerritoryAssignments;
