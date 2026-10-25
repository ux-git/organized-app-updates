import useTerritoryAccess from '@features/territories/useTerritoryAccess';
import { useAppTranslation } from '@hooks/index';
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { pdf } from '@react-pdf/renderer';
import { exportFile } from '@services/files/export';
import { getI18n } from 'react-i18next';
import { s13Rows } from '@features/territories/history/s13_rows';
import { territoryAssigneesState } from '@features/territories/assignees';
import { withGroupHolders } from '@features/territories/group_holder';
import { JWLangLocaleState, shortDateFormatState } from '@states/settings';
import { territoriesState } from '@states/territories';
import { displaySnackNotification } from '@services/states/app';
import { getMessageByCode } from '@services/i18n/translation';
import { formatDate } from '@utils/date';
import { TemplateS13 } from '@views/index';
const useExportS13 = () => {
  const { t } = useAppTranslation();
  const { editor } = useTerritoryAccess();

  const assignees = useAtomValue(territoryAssigneesState);
  // old records naming a group print no name: the group never goes on the S-13
  const territories = withGroupHolders(
    useAtomValue(territoriesState),
    assignees.filter((item) => item.group).map(({ name }) => name)
  );
  const lang = useAtomValue(JWLangLocaleState);
  const dateFormat = useAtomValue(shortDateFormatState);

  const [isProcessing, setIsProcessing] = useState(false);

  const handleExport = async (markCampaigns = false) => {
    if (isProcessing || !editor) return;

    try {
      setIsProcessing(true);

      const rows = [...territories]
        .sort((a, b) =>
          a.number.localeCompare(b.number, undefined, { numeric: true })
        )
        .flatMap((territory) =>
          s13Rows(
            territory,
            dateFormat,
            markCampaigns
              ? getI18n().language.startsWith('de')
                ? 'A'
                : 'C'
              : ''
          )
        );

      const blob = await pdf(
        <TemplateS13
          createdOn={formatDate(new Date(), dateFormat)}
          rows={rows}
          lang={lang}
        />
      ).toBlob();

      await exportFile(
        blob,
        `S-13_${formatDate(new Date(), 'yyyy-MM-dd')}.pdf`
      );
    } catch (error) {
      console.error(error);

      displaySnackNotification({
        header: getMessageByCode('error_app_generic-title'),
        message: t((error as Error).message, {
          defaultValue: t(
            'tr_territoryTheTerritoryDocumentCouldNotBeGeneratedTryAgain'
          ),
        }),
        severity: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return { handleExport, isProcessing };
};

export default useExportS13;
