import { tx } from '@services/i18n/translation';
import { ReactNode, useState } from 'react';
import { Box, FormControlLabel, RadioGroup, Stack } from '@mui/material';
import { Button, Checkbox, CustomDivider, Typography } from '@components/index';
import { useBreakpoints } from '@hooks/index';
import Radio from '@components/radio';
import Dialog from '@components/dialog';
import DialogActions from '@components/dialog_actions';
import IconLoading from '@components/icon_loading';
import { Territory } from '@definition/territory';
import PdfPreview from './pdf_preview';
import useTerritoryExport, { ExportFormat } from './useTerritoryExport';

type Format = { id: ExportFormat; name: string };

const MAP_FORMATS: Format[] = [
  { id: 's12', name: 'S-12' },
  { id: 's12a4', name: 'S-12 on A4' },
  { id: 'a5h', name: 'A5 horizontal' },
  { id: 'a5v', name: 'A5 vertical' },
];

// a phone territory has no map, so the A5 layouts built around one don't apply
const PHONE_FORMATS: Format[] = [
  { id: 's12', name: 'S-12 phone card' },
  { id: 's12a4', name: 'S-12 phone card on A4' },
];

const OptionGroup = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <Stack spacing="8px">
    <Typography className="body-small-semibold" color="var(--grey-400)">
      {label}
    </Typography>
    {children}
  </Stack>
);

const TerritoryExport = ({
  territory,
  onClose,
}: {
  territory: Territory;
  onClose: VoidFunction;
}) => {
  const exporter = useTerritoryExport(territory);
  const [renderedUrl, setRenderedUrl] = useState<string>();
  const loadingPreview =
    exporter.isProcessing ||
    (!!exporter.previewUrl && renderedUrl !== exporter.previewUrl);

  const { tablet600Up } = useBreakpoints();

  const { parts, isPhone } = exporter;

  const formats = isPhone ? PHONE_FORMATS : MAP_FORMATS;

  const handleExport = async () => {
    if (await exporter.handleExport()) onClose();
  };

  return (
    <Dialog
      onClose={onClose}
      open
      title={tx('Print territory: {{number}}', { number: territory.number })}
      description={tx(
        'Choose the content and format, then save or share the PDF.'
      )}
    >
      <Stack
        direction={tablet600Up ? 'row' : 'column'}
        spacing="24px"
        divider={
          tablet600Up && (
            <CustomDivider
              orientation="vertical"
              flexItem
              color="var(--accent-200)"
            />
          )
        }
        sx={{ width: '100%', '& > .MuiStack-root': { flex: 1, minWidth: 0 } }}
      >
        <OptionGroup label={tx('Format')}>
          <RadioGroup
            value={exporter.format}
            onChange={(event) =>
              exporter.setFormat(event.target.value as ExportFormat)
            }
            sx={{ gap: '8px', marginLeft: '6px' }}
          >
            {formats.map((item) => (
              <FormControlLabel
                key={item.id}
                value={item.id}
                control={<Radio />}
                label={<Typography>{tx(item.name)}</Typography>}
              />
            ))}
          </RadioGroup>
        </OptionGroup>

        <OptionGroup label={tx('Include')}>
          <Checkbox
            label={isPhone ? tx('Phone numbers') : tx('Map')}
            checked={parts.front}
            disabled={parts.front && !parts.back}
            onChange={() => exporter.toggleSide('front')}
            className="body-regular"
          />
          <Checkbox
            label={tx('Do not call')}
            checked={parts.back}
            disabled={parts.back && !parts.front}
            onChange={() => exporter.toggleSide('back')}
            className="body-regular"
          />
          {!isPhone && parts.front && (
            <Checkbox
              label={tx('Households')}
              checked={exporter.showHouseholds}
              onChange={(_, checked) => exporter.setShowHouseholds(checked)}
              className="body-regular"
            />
          )}
        </OptionGroup>
      </Stack>

      <Box
        sx={{
          position: 'relative',
          width: '100%',
          // as tall as the pages, scrolling once they pass 380px
          minHeight: '160px',
          maxHeight: '380px',
          display: 'flex',
          flexDirection: 'column',
          // the dialog scrolls instead of squeezing the preview on short screens
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <PdfPreview url={exporter.previewUrl} onSettled={setRenderedUrl} />

        {loadingPreview && (
          <Stack
            sx={{
              position: 'absolute',
              inset: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--white-semi-l)',
            }}
          >
            <Stack
              role="status"
              aria-live="polite"
              direction="row"
              sx={{
                alignItems: 'center',
                gap: 'var(--radius-l)',
                margin: 'var(--radius-l)',
                padding: 'var(--radius-xl)',
                borderRadius: 'var(--radius-l)',
                backgroundColor: 'var(--white)',
                boxShadow: 'var(--small-card-shadow)',
              }}
            >
              <Box aria-hidden="true">
                <IconLoading color="var(--accent-main)" />
              </Box>
              <Typography className="body-small-regular" color="var(--black)">
                {tx('Preparing the preview…')}
              </Typography>
            </Stack>
          </Stack>
        )}
      </Box>

      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {tx('Cancel')}
        </Button>
        <Button
          variant="main"
          disabled={exporter.isProcessing || !exporter.previewUrl}
          endIcon={exporter.isProcessing ? <IconLoading /> : undefined}
          onClick={handleExport}
        >
          {tx('Print')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TerritoryExport;
