import { Page, View } from '@react-pdf/renderer';
import { Document } from '@views/components';
import { TerritoryTemplateProps } from '../index.types';
import CardBack from '../shared/CardBack';
import CardFront from '../shared/CardFront';
import { tx } from '@services/i18n/translation';

import { A5_HORIZONTAL } from '../geometry';

const WIDTH = A5_HORIZONTAL.width;
const HALF = A5_HORIZONTAL.height;

const TemplateTerritoryCard = ({
  territories,
  lang,
  printedOn,
  parts,
}: TerritoryTemplateProps) => {
  return (
    <Document title={tx('Territory card')} lang={lang}>
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
