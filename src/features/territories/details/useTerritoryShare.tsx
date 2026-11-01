import { useAppTranslation } from '@hooks/index';
import { useState } from 'react';
import { useAtomValue } from 'jotai';
import { pdf } from '@react-pdf/renderer';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url';
import { shareFile } from '@services/files/export';
import {
  congNameState,
  JWLangLocaleState,
  shortDateFormatState,
} from '@states/settings';
import {
  territoriesShowDoNotCallMapState,
  territoriesShowHouseholdsState,
  territoryCardFormatState,
} from '@states/territories';
import { displaySnackNotification } from '@services/states/app';
import { formatDate } from '@utils/date';
import { Territory, TerritoryCardFormat } from '@definition/territory';
import { captureTerritoryMap } from '@features/territories/map/capture';
import {
  MAP_INSET,
  MAP_LONG_SIDE,
  MAP_RATIO,
  TEMPLATES,
} from '@features/territories/details/useTerritoryExport';
import {
  A5_HORIZONTAL,
  A5_VERTICAL,
  PRINT_MARGIN,
  printableA5,
  S12,
} from '@views/territories/geometry';

type Area = { x: number; y: number; width: number; height: number };

// pixels per PDF point: about 400 dpi, so labels stay sharp when zoomed in
const SCALE = 5.5;

// the map's own layout size; it sets how many streets and house numbers fit.
// The S-12 map is printed smaller, so a smaller layout keeps its labels large.
const MAP_SIZE: Record<Exclude<TerritoryCardFormat, 's12a4'>, number> = {
  s12: 1150,
  a5h: 1600,
  a5v: 1600,
};

// street names on maps zoomed out too far for house numbers; the small S-12
// layout already prints its labels larger
const WIDE_STREET_SIZE: Record<
  Exclude<TerritoryCardFormat, 's12a4'>,
  number
> = { s12: 14, a5h: 19, a5v: 19 };

// house numbers from street level on; further out they would be too small to read
const HOUSE_NUMBERS_FROM = 16.5;

// an image is one card, not a sheet of paper
const shared = (format: TerritoryCardFormat) =>
  format === 's12a4' ? 's12' : format;

// the part of the page the image shows, in points: an A5 front without its paper
// (it sits in the top left of its A4 sheet), an S-12 card with a thin white edge
const S12_EDGE = 4;
export const CARD_AREA: Record<Exclude<TerritoryCardFormat, 's12a4'>, Area> = {
  s12: {
    x: -S12_EDGE,
    y: -S12_EDGE,
    width: S12.width + S12_EDGE * 2,
    height: S12.height + S12_EDGE * 2,
  },
  a5h: { x: PRINT_MARGIN, y: PRINT_MARGIN, ...printableA5(A5_HORIZONTAL) },
  a5v: { x: PRINT_MARGIN, y: PRINT_MARGIN, ...printableA5(A5_VERTICAL) },
};

export const toJpeg = async (card: Blob, area: Area) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  const loading = pdfjs.getDocument({ data: await card.arrayBuffer() });
  const canvas = document.createElement('canvas');
  try {
    const page = await (await loading.promise).getPage(1);
    canvas.width = Math.round(area.width * SCALE);
    canvas.height = Math.round(area.height * SCALE);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const viewport = page.getViewport({
      scale: SCALE,
      offsetX: -area.x * SCALE,
      offsetY: -area.y * SCALE,
    });
    await page.render({ canvas, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error())),
        'image/jpeg',
        0.88
      )
    );
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    await loading.destroy().catch(() => undefined);
  }
};

// the printed card's front, so a publisher gets what the card would show
export const shareCard = async (
  territory: Territory,
  cardFormat: TerritoryCardFormat,
  card: {
    congregation: string;
    lang: string;
    printedOn: string;
    doNotCalls: boolean;
    showHouseholds: boolean;
    failed: string;
  }
) => {
  const format = shared(cardFormat);
  const picture = await captureTerritoryMap(
    territory,
    MAP_RATIO[format],
    MAP_INSET[format],
    MAP_LONG_SIDE[format],
    false,
    card.doNotCalls,
    {
      size: MAP_SIZE[format],
      // as sharp as the image it is drawn into; 4096 px is the map's limit
      pixelRatio: Math.min(
        (MAP_LONG_SIDE[format] * SCALE) / MAP_SIZE[format],
        2.56
      ),
      // a smaller layout zooms out, though its house numbers print as large
      detailFromZoom:
        HOUSE_NUMBERS_FROM - Math.log2(MAP_SIZE.a5h / MAP_SIZE[format]),
      wideStreetSize: WIDE_STREET_SIZE[format],
      jpeg: true,
    }
  );
  if (!picture) throw new Error(card.failed);

  const Template = TEMPLATES[format];
  return pdf(
    <Template
      congregation={card.congregation}
      territories={[
        {
          ...territory,
          warning: territory.warning?.trim() || undefined,
          mapImage: picture,
          showHouseholds: card.showHouseholds,
        },
      ]}
      lang={card.lang}
      printedOn={card.printedOn}
      parts={{ front: true, back: false }}
    />
  ).toBlob();
};

const useTerritoryShare = (territory: Territory) => {
  const { t } = useAppTranslation();

  const congregation = useAtomValue(congNameState);
  const locale = useAtomValue(JWLangLocaleState);
  const dateFormat = useAtomValue(shortDateFormatState);
  const showDoNotCalls = useAtomValue(territoriesShowDoNotCallMapState);
  const showHouseholds = useAtomValue(territoriesShowHouseholdsState);
  const cardFormat = useAtomValue(territoryCardFormatState);

  const [sharing, setSharing] = useState(false);

  const share = async () => {
    if (sharing) return;
    setSharing(true);

    const name = `${t('tr_territoryLabel')}-${territory.number}`.replace(
      /\s+/g,
      '-'
    );

    try {
      await shareFile(async () => {
        const front = await shareCard(territory, cardFormat, {
          congregation,
          lang: locale,
          printedOn: formatDate(new Date(), dateFormat),
          doNotCalls: showDoNotCalls,
          showHouseholds,
          failed: t('tr_territoryTheMapPictureCouldNotBeCreatedPleaseTry'),
        });
        return toJpeg(front, CARD_AREA[shared(cardFormat)]);
      }, `${name}.jpg`);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        displaySnackNotification({
          header: t('tr_territorySharingFailed'),
          message: t((error as Error).message, {
            defaultValue: t(
              'tr_territoryTheTerritoryMapCouldNotBeSharedTryAgain'
            ),
          }),
          severity: 'error',
        });
      }
    } finally {
      setSharing(false);
    }
  };

  return { share, sharing };
};

export default useTerritoryShare;
