import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignmentIssues } from '../assignment_issues';

const today = new Date(2026, 8, 27, 15, 30);

test('past dates in order have no issues', () => {
  assert.deepEqual(
    assignmentIssues(
      { assignedOn: '01.03.2026', returnedOn: '20.06.2026' },
      today
    ),
    []
  );
});

test('today is not the future, whatever the time', () => {
  assert.deepEqual(
    assignmentIssues(
      { assignedOn: '27.09.2026', returnedOn: '27.09.2026' },
      today
    ),
    []
  );
});

test('an assigned date after today', () => {
  assert.deepEqual(assignmentIssues({ assignedOn: '28.09.2026' }, today), [
    'assigned_future',
  ]);
});

test('a returned date after today', () => {
  assert.deepEqual(
    assignmentIssues(
      { assignedOn: '01.09.2026', returnedOn: '01.01.2027' },
      today
    ),
    ['returned_future']
  );
});

test('returned before it was assigned', () => {
  assert.deepEqual(
    assignmentIssues(
      { assignedOn: '10.05.2026', returnedOn: '09.05.2026' },
      today
    ),
    ['returned_before_assigned']
  );
});

test('several issues at once', () => {
  assert.deepEqual(
    assignmentIssues(
      { assignedOn: '10.12.2026', returnedOn: '01.12.2026' },
      today
    ),
    ['assigned_future', 'returned_future', 'returned_before_assigned']
  );
});

test('missing or unreadable dates are not flagged', () => {
  assert.deepEqual(assignmentIssues({ assignedOn: '' }, today), []);
  assert.deepEqual(
    assignmentIssues({ assignedOn: 'soon', returnedOn: '' }, today),
    []
  );
});
