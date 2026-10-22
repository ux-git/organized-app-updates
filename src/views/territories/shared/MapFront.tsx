import { Image, Text, View } from '@react-pdf/renderer';
import { TerritoryPrintData } from '../index.types';
import styles, { CHIP_HEIGHT, COLORS } from '../index.styles';
import { tx } from '@services/i18n/translation';
import { titleOf } from './title';
import Shadow from './Shadow';
import WarningChip from './WarningChip';

const INSET = 9;

const Chip = ({ text }: { text: string }) => (
  <View
    style={{
      // a step darker than the screen chip: printers drop the lightest greys
      backgroundColor: COLORS.divider,
      borderRadius: 2,
      height: CHIP_HEIGHT,
      justifyContent: 'center',
      paddingLeft: 5,
      paddingRight: 5,
    }}
  >
    <Text style={[styles.households, { fontSize: 7, fontWeight: 400 }]}>
      {text}
    </Text>
  </View>
);

// the A5 map fills the card, and a white label floats over its bottom edge
const MapFront = ({
  territory,
  width,
  height,
}: {
  territory: TerritoryPrintData;
  width: number;
  height: number;
}) => (
  <View style={{ position: 'relative', width, height }}>
    {territory.mapImage ? (
      <Image
        src={territory.mapImage}
        style={{ width, height, objectFit: 'cover' }}
      />
    ) : (
      <View
        style={{
          width,
          height,
          border: `1px dashed ${COLORS.line}`,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={styles.fine}>
          {tx('This territory has no borders on the map yet')}
        </Text>
      </View>
    )}

    <View
      style={{
        position: 'absolute',
        left: INSET,
        right: INSET,
        bottom: INSET,
      }}
    >
      <Shadow radius={6} drop={6} spread={10} opacity={0.0065} />

      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 6,
          // one inset on every side: the badges sit as far from the top as from the right
          padding: 9,
          gap: 6,
        }}
      >
        {/* the chips stay one row; with a long title they move below it,
            right-aligned, instead of squeezing the title */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: 8,
            rowGap: 6,
          }}
        >
          <Text style={{ flexGrow: 1 }}>
            <Text style={styles.frameTitle}>
              {tx('Territory Map Card')}
              {'\u2002'}
            </Text>
            <Text style={styles.frameName}>{titleOf(territory)}</Text>
          </Text>
          <View style={{ flexDirection: 'row', gap: 4, marginLeft: 'auto' }}>
            {territory.warning && <WarningChip text={territory.warning} />}
            {territory.showHouseholds !== false && territory.households > 0 && (
              <Chip
                text={tx('Households: {{n}}', { n: territory.households })}
              />
            )}
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            paddingTop: 5,
            // react-pdf drops borders under 0.5 pt; 0.5 pt still prints on a home printer
            borderTop: `0.5px solid ${COLORS.divider}`,
          }}
        >
          <Text style={[styles.frameNote, { flexGrow: 1, flexBasis: 0 }]}>
            {tx(
              'Please keep this card in the envelope. Do not soil, mark, or bend it. Each time the territory is covered, please inform the brother who cares for the territory files.'
            )}
          </Text>
        </View>
      </View>
    </View>
  </View>
);

export default MapFront;
