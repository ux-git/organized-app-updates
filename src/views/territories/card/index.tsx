import { useAppTranslation } from '@hooks/index';
import { Page, View } from '@react-pdf/renderer';
import { Document } from '@views/components';
import { TerritoryTemplateProps } from '@views/territories/index.types';
import CardBack from '@views/territories/shared/CardBack';
import CardFront from '@views/territories/shared/CardFront';

import { A5_HORIZONTAL } from '@views/territories/geometry';

const WIDTH = A5_HORIZONTAL.width;
const HALF = A5_HORIZONTAL.height;

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
          size="A4"
          style={{
            backgroundColor: '#FFFFFF',
          }}
        >
          <View wrap={false} style={{ position: 'relative', width: WIDTH }}>
            {parts.front && (
              <CardFront territory={territory} width={WIDTH} height={HALF} />
            )}

            {parts.back && (
              <CardBack
                territory={territory}
                width={WIDTH}
                height={HALF}
                notes={territory.notes}
                printedOn={printedOn}
              />
            )}
          </View>
        </Page>
      ))}
    </Document>
  );
};

export default TemplateTerritoryCard;
