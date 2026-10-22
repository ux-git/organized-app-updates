import { AppModuleId, LocalOnlyCategory } from './settings';

export type AppModuleDefinition = {
  // the synced tables the module owns; none for a module that only shows
  // data another module syncs
  categories: LocalOnlyCategory[];
  // the module whose data this one shows, when it owns none
  follows?: AppModuleId;
  // only this role may move the module's data off the server
  restrictedTo?: 'secretary';
};

export const APP_MODULE_DEFINITIONS: Record<AppModuleId, AppModuleDefinition> =
  {
    field_service_reports: {
      categories: ['cong_field_service_reports'],
      restrictedTo: 'secretary',
    },
    publisher_records: { categories: [], follows: 'field_service_reports' },
    branch_reports: {
      categories: ['branch_field_service_reports', 'branch_cong_analysis'],
    },
    meeting_attendance: { categories: ['meeting_attendance'] },
  };
