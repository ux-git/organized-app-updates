import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { Box, Stack } from '@mui/material';
import { IconDelete } from '@icons/index';
import Autocomplete from '@components/autocomplete';
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
import ProfilePictureEntry from '@features/my_profile/user_profile_details/profile_picture_entry';
import { useBreakpoints } from '@hooks/index';
import { isDarkThemeState } from '@states/app';
import { invoke } from '../native';
import {
  loadIdentity,
  Person,
  setAvatar,
  setLink,
  suggestedLink,
} from '../persistence';
import {
  myAvatarState,
  myLinkState,
  peopleState,
  pictureFrom,
} from '../profiles';
import { LANGUAGES, setLanguage, t } from '../i18n';
import { followSystemState, setFollowSystem, setTheme } from '../theme';
import useNearby from './useNearby';
import { notify } from './sync/text';

// My profile: the name and picture paired phones show for this one, the
// publisher it belongs to, the language and the theme
const Profile = () => {
  const { i18n } = useTranslation();
  const { tabletDown } = useBreakpoints();
  const { name } = useNearby();
  const isDark = useAtomValue(isDarkThemeState);
  const followSystem = useAtomValue(followSystemState);
  const avatar = useAtomValue(myAvatarState);
  const link = useAtomValue(myLinkState);
  const publishers = useAtomValue(peopleState)
    .filter((person) => !person.group)
    .sort((a, b) => a.name.localeCompare(b.name));
  const suggestion = link.person ? undefined : suggestedLink(name, publishers);
  const [value, setValue] = useState(name);
  // Enter and then leaving the field would save the same name twice
  const sent = useRef(name);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(name);
    sent.current = name;
  }, [name]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === sent.current) return;
    sent.current = trimmed;
    try {
      await invoke('set_name', { name: trimmed });
      await loadIdentity();
    } catch (error) {
      sent.current = name;
      notify(t('common.somethingWrong'), String(error), 'error');
    }
  };

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    let picture: string;
    try {
      picture = await pictureFrom(file);
    } catch {
      notify(t('common.somethingWrong'), t('account.pictureFailed'), 'error');
      return;
    }
    changePicture(picture);
  };

  const changePicture = (picture: string | null) =>
    setAvatar(picture).catch((error) =>
      notify(t('common.somethingWrong'), String(error), 'error')
    );

  const changeLink = (person: string | null) =>
    setLink(person).catch((error) =>
      notify(t('common.somethingWrong'), String(error), 'error')
    );

  return (
    <>
      <CardSection>
        <CardSectionHeader
          title={t('common.yourName')}
          description={t('nameDialog.description')}
        />
        <Box sx={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <ProfilePictureEntry
            size={tabletDown ? 44 : 48}
            onOpen={() => picker.current?.click()}
          />
          <TextField
            label={t('common.fullName')}
            height={48}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => event.key === 'Enter' && save()}
          />
        </Box>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          hidden
          onChange={pick}
        />
        {avatar && (
          <Button
            variant="small"
            color="red"
            startIcon={<IconDelete />}
            disableAutoStretch
            onClick={() => changePicture(null)}
            sx={{ alignSelf: 'flex-start' }}
          >
            {t('account.removePicture')}
          </Button>
        )}
      </CardSection>

      <CardSection>
        <CardSectionHeader
          title={t('account.linked')}
          description={t('account.linkedText')}
        />
        <Autocomplete
          label={t('account.publisher')}
          options={publishers}
          getOptionLabel={(option) => (option as Person).name}
          isOptionEqualToValue={(option, value) =>
            (option as Person).id === (value as Person).id
          }
          value={link.person ?? null}
          onChange={(_, value) =>
            changeLink((value as Person | null)?.id ?? null)
          }
          noOptionsText={
            <Typography className="body-regular" color="var(--grey-350)">
              {t('account.noPublishers')}
            </Typography>
          }
          renderOption={(props, option) => (
            <Box
              component="li"
              {...props}
              sx={{ margin: 0, padding: 0 }}
              key={option.id}
            >
              <Typography>{option.name}</Typography>
            </Box>
          )}
        />
        {link.missing && <InfoNote message={t('account.linkMissing')} />}
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
          onChange={(event) => setLanguage(String(event.target.value))}
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
              onChange={setFollowSystem}
            />
            {!followSystem && (
              <Select
                label={t('settings.theme')}
                value={isDark ? 'dark' : 'light'}
                onChange={(event) => setTheme(String(event.target.value))}
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
            <ColorSchemeSwitcher />
          </Stack>
        </CardSectionContent>
      </CardSection>
    </>
  );
};

export default Profile;
