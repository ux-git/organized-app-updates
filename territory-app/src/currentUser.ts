// Whoever runs this app looks after the territories, so they get the
// territory servant's view; there is no account behind it.
const useCurrentUser = () => ({
  person: undefined,
  first_report: undefined,
  enable_AP_application: false,
  isAdmin: false,
  isPublisher: true,
  isServiceCommittee: true,
  isElder: true,
  isPersonEditor: false,
  isAttendanceEditor: false,
  isAppointed: true,
  isMidweekEditor: false,
  isWeekendEditor: false,
  accountType: 'vip',
  isMeetingEditor: false,
  isSecretary: false,
  isPersonViewer: false,
  isPublicTalkCoordinator: false,
  isGroupOverseer: false,
  my_group: undefined,
  isGroup: false,
  languageGroup: undefined,
  isLanguageGroupOverseer: false,
  isSettingsEditor: false,
});

export default useCurrentUser;
