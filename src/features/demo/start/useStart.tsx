import { useEffect } from 'react';
import {
  dbBranchS1ReportsFill,
  dbFieldGroupAutoAssign,
  dbMeetingAttendanceFill,
  dbReportsFillRandom,
  dbSchedulesAutoFill,
  dbSettingsAssignMainWTStudyConductor,
  importDummyPersons,
} from '@utils/dev';
import { dbAppDelete, dbAppOpen } from '@services/dexie/app';
import { dbAppSettingsBuildTest } from '@services/dexie/settings';
import { displaySnackNotification, setIsAppLoad } from '@services/states/app';
import { loadApp, runUpdater } from '@services/app';
import { dbSpeakersCongregationsDummy } from '@services/dexie/speakers_congregations';
import { dbVisitingSpeakersDummy } from '@services/dexie/visiting_speakers';
import { apiFetchSources } from '@services/api/sources';
import { sourcesImportJW } from '@services/app/sources';
import { dbSongUpdate } from '@services/dexie/songs';
import { dbPublicTalkUpdate } from '@services/dexie/public_talk';
import { dbWeekTypeUpdate } from '@services/dexie/weekType';
import { dbAssignmentUpdate } from '@services/dexie/assignment';
import { TIMER_KEY } from '@constants/index';
import useInternetChecker from '@hooks/useInternetChecker';
import logger from '@services/logger/index';
import { bootStep } from '@platform/boot_diagnostics';
import { dbPersonsAssignFamilyHeads } from '@services/dexie/persons';

const useStart = () => {
  const { isNavigatorOnline } = useInternetChecker();

  useEffect(() => {
    document.title = 'Test Organized app (sws2apps)';

    const handlePrepareTest = async () => {
      localStorage.removeItem(TIMER_KEY);

      bootStep('dbAppDelete');
      await dbAppDelete();
      bootStep('dbAppOpen');
      await dbAppOpen();

      bootStep('dbSongUpdate');
      await dbSongUpdate();
      bootStep('dbPublicTalkUpdate');
      await dbPublicTalkUpdate();
      bootStep('dbWeekTypeUpdate');
      await dbWeekTypeUpdate();
      bootStep('dbAssignmentUpdate');
      await dbAssignmentUpdate();
      bootStep('importDummyPersons');
      await importDummyPersons(false);
      bootStep('dbAppSettingsBuildTest');
      await dbAppSettingsBuildTest();
      bootStep('dbSpeakersCongregationsDummy');
      await dbSpeakersCongregationsDummy();
      bootStep('dbVisitingSpeakersDummy');
      await dbVisitingSpeakersDummy();
      bootStep('dbSettingsAssignMainWTStudyConductor');
      await dbSettingsAssignMainWTStudyConductor();
      bootStep('dbFieldGroupAutoAssign');
      await dbFieldGroupAutoAssign();
      bootStep('dbReportsFillRandom');
      await dbReportsFillRandom();
      bootStep('dbMeetingAttendanceFill');
      await dbMeetingAttendanceFill();
      bootStep('dbBranchS1ReportsFill');
      await dbBranchS1ReportsFill();
      bootStep('dbPersonsAssignFamilyHeads');
      await dbPersonsAssignFamilyHeads();

      if (isNavigatorOnline) {
        // Meeting sources come from the network. On a device that request can
        // fail in ways a browser tab never does, and it is not worth losing
        // the whole test dataset over: everything above is already seeded.
        try {
          const { data, status } = await apiFetchSources();
          if (status === 200 && data?.length) {
            await sourcesImportJW(data);
            await dbSchedulesAutoFill();
          }
        } catch (error) {
          logger.error(
            'demo',
            `could not fetch meeting sources: ${(error as Error).message}`
          );
        }
      }

      bootStep('runUpdater');
      await runUpdater();

      bootStep('loadApp');
      loadApp();
    };

    /**
     * The loading screen is only ever dismissed by `setIsAppLoad(false)`, so
     * anything that throws on the way there strands the user on it forever
     * with nothing reported. Always leave the screen, and say what broke.
     */
    const handleStart = async () => {
      try {
        await handlePrepareTest();
      } catch (error) {
        logger.error(
          'demo',
          `test mode setup failed: ${(error as Error).stack ?? error}`
        );

        displaySnackNotification({
          header: 'Test mode setup failed',
          message: (error as Error).message,
          severity: 'error',
        });
      } finally {
        setIsAppLoad(false);
      }
    };

    const timeOut = setTimeout(handleStart, 5000);

    return () => {
      clearTimeout(timeOut);
    };
  }, [isNavigatorOnline]);

  return {};
};

export default useStart;
