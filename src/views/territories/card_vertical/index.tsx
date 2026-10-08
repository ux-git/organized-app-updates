import { Page, View } from '@react-pdf/renderer';
import { Document } from '@views/components';
import { TerritoryTemplateProps } from '../index.types';
import CardBack from '../shared/CardBack';
import MapFront from '../shared/MapFront';
import { tx } from '@services/i18n/translation';

// an A4 sheet on its side, two A5 halves: the map, and what goes with it
import { A5_VERTICAL } from '../geometry';

const HALF = A5_VERTICAL.width;

const TemplateTerritoryCardVertical = ({
  territories,
  lang,
  printedOn,
  parts,
}: TerritoryTemplateProps) => (
  <Document title={tx('Territory card')} lang={lang}>
    {territories.map((territory) => (
      <Page
        key={territory.id}
        size="A4"
        orientation="landscape"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <View
          wrap={false}
          style={{
            position: 'relative',
            flexDirection: 'row',
            width: HALF * 2,
            height: A5_VERTICAL.height,
          }}
        >
          {parts.front ? (
            <MapFront
              territory={territory}
              width={HALF}
              height={A5_VERTICAL.height}
            />
          ) : (
            <View style={{ width: HALF }} />
          )}
          {parts.back && (
            <CardBack
              territory={territory}
              width={HALF}
              height={A5_VERTICAL.height}
              notes={territory.notes}
              printedOn={printedOn}
            />
          )}
        </View>
      </Page>
    ))}
  </Document>
);

export default TemplateTerritoryCardVertical;
