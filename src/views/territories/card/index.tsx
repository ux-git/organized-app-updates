import { useAppTranslation } from '@hooks/index';
import { Page, View } from '@react-pdf/renderer';
import { Document } from '@views/components';
import { TerritoryTemplateProps } from '@views/territories/index.types';
import CardBack from '@views/territories/shared/CardBack';
import MapFront from '@views/territories/shared/MapFront';

import {
  A5_HORIZONTAL,
  PRINT_MARGIN,
  printableA5,
} from '@views/territories/geometry';

const { width: WIDTH, height: HALF } = printableA5(A5_HORIZONTAL);

const TemplateTerritoryCard = ({
  territories,
  lang,
  printedOn,
  parts,
}: TerritoryTemplateProps) => {
  const { t } = useAppTranslation();

  return (
    <Document title={t('tr_territoryTerritoryCard')} lang={lang}>
      {territories.map((territory) => (
        <Page
          key={territory.id}
          wrap={false}
          size="A4"
          style={{
            backgroundColor: '#FFFFFF',
          }}
        >
          <View
            wrap={false}
            style={{ position: 'relative', width: A5_HORIZONTAL.width }}
          >
            {parts.front && (
              <View
                style={{ padding: PRINT_MARGIN, height: A5_HORIZONTAL.height }}
              >
                <MapFront territory={territory} width={WIDTH} height={HALF} />
              </View>
            )}

            {parts.back && (
              <View
                style={{ padding: PRINT_MARGIN, height: A5_HORIZONTAL.height }}
              >
                <CardBack
                  territory={territory}
                  width={WIDTH}
                  height={HALF}
                  notes={territory.notes}
                  printedOn={printedOn}
                />
              </View>
            )}
          </View>
        </Page>
      ))}
    </Document>
  );
};

export default TemplateTerritoryCard;
