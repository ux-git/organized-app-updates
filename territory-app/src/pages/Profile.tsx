import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { IconDelete } from '@icons/index';
import Button from '@components/button';
import MenuItem from '@components/menuitem';
import Select from '@components/select';
import SwitchWithLabel from '@components/switch_with_label';
import InfoNote from '@components/info_note';
import TextField from '@components/textfield';
import Typography from '@components/typography';
import ColorSchemeSwitcher from '@features/color_scheme_selector';
import {
  CardSection,
  CardSectionContent,
  CardSectionHeader,
  CardSubSectionHeader,
} from '@features/congregation/settings/shared_styles';
import ProfilePictureSelector from '@features/my_profile/user_profile_details/profile_picture_selector';
import ProfilePictureEntry from '@features/my_profile/user_profile_details/profile_picture_entry';
import PublisherSearch from '@features/territories/components/publisher_search';
import { useAppTranslation, useBreakpoints } from '@hooks/index';
import { isDarkThemeState } from '@states/app';
import { hapticsEnabledState } from '@states/settings';
import { chosen, pickedRadio, setHapticsEnabled, toggled } from '../haptics';
import { invoke } from '../native';
import {
  loadIdentity,
  Person,
  renameOnTerritories,
  setAvatar,
  setLink,
  suggestedLink,
} from '../persistence';
import { myLinkState, peopleState } from '../profiles';
import { LANGUAGES, setLanguage, t } from '../i18n';
import { followSystemState, setFollowSystem, setTheme } from '../theme';
import useNearby from './useNearby';
import { notify } from './sync/text';

const failed = (error: unknown) => {
  console.error('profile: saving failed', error);
  notify(t('common.somethingWrong'), t('common.notSaved'), 'error');
};

// My profile: the name and picture paired phones show for this one, the
// publisher it belongs to, the language, the theme and the vibration
const Profile = () => {
  const { i18n } = useTranslation();
  const { t: appText } = useAppTranslation();
  const { tabletDown } = useBreakpoints();
  const { name } = useNearby();
  const isDark = useAtomValue(isDarkThemeState);
  const followSystem = useAtomValue(followSystemState);
  const haptics = useAtomValue(hapticsEnabledState);
  const link = useAtomValue(myLinkState);
  const publishers = useAtomValue(peopleState)
    .filter((person) => !person.group)
    .sort((a, b) => a.name.localeCompare(b.name));
  const suggestion = link.person ? undefined : suggestedLink(name, publishers);
  const [value, setValue] = useState(name);
  // Enter and then leaving the field would save the same name twice
  const sent = useRef(name);
  const [pictureOpen, setPictureOpen] = useState(false);

  useEffect(() => {
    setValue(name);
    sent.current = name;
  }, [name]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setValue(name);
      return;
    }
    if (trimmed === sent.current) return;
    sent.current = trimmed;
    // unlinked, the territories carry this device's name as "me"
    const own = !link.person && !suggestion;
    try {
      await invoke('set_name', { name: trimmed });
      if (own && name) renameOnTerritories(new Map([[name, trimmed]]));
      await loadIdentity();
    } catch (error) {
      sent.current = name;
      failed(error);
    }
  };

  const changeLink = (person: string | null) => setLink(person).catch(failed);

  return (
    <>
      {pictureOpen && (
        <ProfilePictureSelector
          open
          allPictures
          onSave={setAvatar}
          onClose={() => setPictureOpen(false)}
        />
      )}
      <CardSection>
        <CardSectionHeader
          title={t('common.yourName')}
          description={t('nameDialog.description')}
        />
        <Box sx={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <ProfilePictureEntry
            size={tabletDown ? 44 : 48}
            onOpen={() => setPictureOpen(true)}
          />
          <TextField
            label={appText('tr_name')}
            height={48}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => event.key === 'Enter' && save()}
          />
        </Box>
      </CardSection>

      <CardSection>
        <CardSectionHeader
          title={t('account.linked')}
          description={t('account.linkedText')}
        />
        <PublisherSearch
          label={t('account.publisher')}
          options={publishers}
          value={link.person ?? null}
          onChange={(person) => changeLink(chosen(person?.id ?? null))}
          getName={(person: Person) => person.name}
          noOptionsText={
            <Typography className="body-regular" color="var(--grey-350)">
              {t('account.noPublishers')}
            </Typography>
          }
        />
        {link.missing && (
          <InfoNote
            message={t(
              link.group ? 'account.linkGroup' : 'account.linkMissing'
            )}
          />
        )}
        {(link.person || link.missing) && (
          <Button
            variant="small"
            color="red"
            startIcon={<IconDelete />}
            disableAutoStretch
            onClick={() => changeLink(null)}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t('account.unlink')}
          </Button>
        )}
        {suggestion && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <Typography className="body-small-regular" color="var(--grey-400)">
              {t('account.suggest', { name: suggestion.name })}
            </Typography>
            <Button
              variant="small"
              disableAutoStretch
              onClick={() => changeLink(suggestion.id)}
            >
              {t('account.link')}
            </Button>
          </Box>
        )}
      </CardSection>

      <CardSection>
        <CardSectionHeader title={t('settings.language')} />
        <Select
          label={t('settings.language')}
          value={i18n.language}
          onChange={(event) => setLanguage(chosen(String(event.target.value)))}
        >
          {LANGUAGES.map((language) => (
            <MenuItem key={language.code} value={language.code}>
              <Typography className="body-regular" color="var(--black)">
                {language.name}
              </Typography>
            </MenuItem>
          ))}
        </Select>
      </CardSection>

      <CardSection>
        <CardSectionHeader title={t('settings.theme')} />
        <CardSectionContent>
          <Stack spacing="16px">
            <SwitchWithLabel
              label={t('settings.followSystem')}
              helper={t('settings.followSystemText')}
              checked={followSystem}
              onChange={(on) => setFollowSystem(toggled(on))}
            />
            {!followSystem && (
              <Select
                label={t('settings.theme')}
                value={isDark ? 'dark' : 'light'}
                onChange={(event) =>
                  setTheme(chosen(String(event.target.value)))
                }
              >
                {['light', 'dark'].map((theme) => (
                  <MenuItem key={theme} value={theme}>
                    <Typography className="body-regular" color="var(--black)">
                      {t(`settings.${theme}`)}
                    </Typography>
                  </MenuItem>
                ))}
              </Select>
            )}
          </Stack>
          <Stack spacing="16px">
            <CardSubSectionHeader title={t('settings.colorScheme')} />
            <Box onClickCapture={pickedRadio}>
              <ColorSchemeSwitcher />
            </Box>
          </Stack>
        </CardSectionContent>
      </CardSection>

      <CardSection>
        <CardSectionHeader title={t('settings.vibration')} />
        <SwitchWithLabel
          label={t('settings.haptics')}
          helper={t('settings.hapticsText')}
          checked={haptics}
          onChange={setHapticsEnabled}
        />
      </CardSection>
    </>
  );
};

export default Profile;
