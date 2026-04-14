import { FormatNameOption } from '@definition/settings';
import {
  useAppTranslation,
  useBreakpoints,
  useCurrentUser,
} from '@hooks/index';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
  TwoColumnsRow,
} from '../shared_styles';
import useCircuitOverseer from './useCircuitOverseer';
import TextField from '@components/textfield';
import WeeksList from './weeks_list';
import { Stack } from '@mui/material';

const CircuitOverseer = () => {
  const { t } = useAppTranslation();

  const { tablet600Up } = useBreakpoints();

  const { isAdmin } = useCurrentUser();

  const {
    fullnameOption,
    displayNameEnabled,
    displayname,
    firstname,
    handleDisplaynameChange,
    handleDisplaynameSave,
    handleFirstnameChange,
    handleFirstnameSave,
    handleMiddlenameChange,
    handleMiddlenameSave,
    handleLastnameChange,
    handleLastnameSave,
    lastname,
    middlename,
    middleNameVisible,
  } = useCircuitOverseer();

  return (
    <CardSection>
      <CardSectionHeader
        title={t('tr_circuitOverseer')}
        description={t('tr_circuitOverseerSettingDesc')}
      />

      <CardSectionContent>
        <Stack spacing="16px">
          <TwoColumnsRow
            sx={{
              flexDirection: tablet600Up
                ? fullnameOption === FormatNameOption.FIRST_LAST
                  ? 'row'
                  : 'row-reverse'
                : fullnameOption === FormatNameOption.FIRST_LAST
                  ? 'column'
                  : 'column-reverse',
            }}
          >
            <TextField
              type="text"
              label={t('tr_firstname')}
              value={firstname}
              onChange={(e) => handleFirstnameChange(e.target.value)}
              onKeyUp={handleFirstnameSave}
              slotProps={{ input: { readOnly: !isAdmin } }}
            />
            {middleNameVisible && (
              <TextField
                type="text"
                label={t('tr_middlename')}
                value={middlename}
                onChange={(e) => handleMiddlenameChange(e.target.value)}
                onKeyUp={handleMiddlenameSave}
                slotProps={{ input: { readOnly: !isAdmin } }}
              />
            )}
            <TextField
              type="text"
              label={t('tr_lastname')}
              value={lastname}
              onChange={(e) => handleLastnameChange(e.target.value)}
              onKeyUp={handleLastnameSave}
              slotProps={{ input: { readOnly: !isAdmin } }}
            />
          </TwoColumnsRow>

          {displayNameEnabled && (
            <TextField
              type="text"
              label={t('tr_displayName')}
              value={displayname}
              onChange={(e) => handleDisplaynameChange(e.target.value)}
              onKeyUp={handleDisplaynameSave}
              slotProps={{ input: { readOnly: !isAdmin } }}
            />
          )}

          <WeeksList />
        </Stack>
      </CardSectionContent>
    </CardSection>
  );
};

export default CircuitOverseer;
