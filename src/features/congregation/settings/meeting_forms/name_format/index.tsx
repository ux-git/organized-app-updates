import { Box } from '@mui/material';
import { useAppTranslation, useCurrentUser } from '@hooks/index';
import { FormatNameOption } from '@definition/settings';
import useNameFormat from './useNameFormat';
import MenuItem from '@components/menuitem';
import Select from '@components/select';
import Typography from '@components/typography';

const NameFormat = () => {
  const { t } = useAppTranslation();

  const { isMidweekEditor, isWeekendEditor, isPublicTalkCoordinator } =
    useCurrentUser();

  const { formatInApp, formatPrint, handleFormatInAppChange, handleFormatPrintChange } = useNameFormat();

  const readOnly = !isMidweekEditor && !isWeekendEditor && !isPublicTalkCoordinator;

  const renderOptions = () => (
    <>
      <MenuItem value={FormatNameOption.FIRST_LAST}>
        <Typography>{t('tr_formatFirstLast')} (John Smith)</Typography>
      </MenuItem>
      <MenuItem value={FormatNameOption.LAST_FIRST}>
        <Typography>{t('tr_formatLastFirst')} (Smith John)</Typography>
      </MenuItem>
      <MenuItem value={FormatNameOption.FULL_NAME}>
        <Typography>{t('tr_formatFullName')} (John Robert Smith)</Typography>
      </MenuItem>
      <MenuItem value={FormatNameOption.ABBREVIATED_LAST}>
        <Typography>{t('tr_formatAbbreviatedLast')} (John S.)</Typography>
      </MenuItem>
      <MenuItem value={FormatNameOption.ABBREVIATED_FIRST}>
        <Typography>{t('tr_formatAbbreviatedFirst')} (Smith J.)</Typography>
      </MenuItem>
      <MenuItem value={FormatNameOption.ABBREVIATED_FULL_NAME}>
        <Typography>{t('tr_formatAbbreviatedFullName')} (John R. S.)</Typography>
      </MenuItem>
      <MenuItem value={FormatNameOption.FIRST_MIDDLE_INITIAL_LAST}>
        <Typography>{t('tr_formatFirstMiddleInitialLast')} (John R. Smith)</Typography>
      </MenuItem>
    </>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Select
        label={t('tr_formatNameInApp')}
        value={formatInApp}
        onChange={(e) => handleFormatInAppChange(+e.target.value)}
        readOnly={readOnly}
      >
        {renderOptions()}
      </Select>
      <Select
        label={t('tr_formatNamePrint')}
        value={formatPrint}
        onChange={(e) => handleFormatPrintChange(+e.target.value)}
        readOnly={readOnly}
      >
        {renderOptions()}
      </Select>
    </Box>
  );
};

export default NameFormat;
