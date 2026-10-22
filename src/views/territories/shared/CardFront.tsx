import { Image, Text, View } from '@react-pdf/renderer';
import { TerritoryPrintData } from '../index.types';
import styles, { CARD, COLORS } from '../index.styles';
import { tx } from '@services/i18n/translation';
import { titleOf } from './title';
import Shadow from './Shadow';
import WarningChip from './WarningChip';

const COLUMNS = 4;

const digits = (value: string) => value.replace(/\D/g, '');

const PhoneGrid = ({
  numbers,
  blocked,
  width,
}: {
  numbers: string[];
  // do-not-call numbers, struck through so they read on a black and white print
  blocked: string[];
  width: number;
}) => {
  const cell = (width - (COLUMNS - 1) * 4) / COLUMNS;
  const skip = new Set(blocked.map(digits));

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {numbers.map((number, index) => (
        <View
          key={`${index}-${number}`}
          style={{
            width: cell,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingTop: 4,
            paddingBottom: 4,
            paddingLeft: 4,
            paddingRight: 4,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 4,
          }}
        >
          <View
            style={{
              minWidth: 15,
              height: 15,
              borderRadius: 999,
              backgroundColor: COLORS.numberChip,
              alignItems: 'center',
              justifyContent: 'center',
              paddingLeft: 3,
              paddingRight: 3,
            }}
          >
            <Text style={styles.number}>{index + 1}</Text>
          </View>
          <Text
            style={[
              styles.phone,
              skip.has(digits(number))
                ? { color: COLORS.dncText, textDecoration: 'line-through' }
                : {},
            ]}
          >
            {number}
          </Text>
        </View>
      ))}
    </View>
  );
};

const MapBadge = ({ text }: { text: string }) => (
  <View style={{ position: 'relative' }}>
    <Shadow radius={4} spread={3} drop={2} />
    <View
      style={{
        backgroundColor: COLORS.paper,
        border: `0.5px solid ${COLORS.line}`,
        borderRadius: 4,
        paddingTop: 2,
        paddingBottom: 2,
        paddingLeft: 5,
        paddingRight: 5,
      }}
    >
      <Text style={[styles.households, { fontSize: 7, fontWeight: 400 }]}>
        {text}
      </Text>
    </View>
  </View>
);

const CardFront = ({
  territory,
  width,
  height,
  printedOn,
}: {
  territory: TerritoryPrintData;
  width: number;
  height: number;
  // the A5 card has its date on the back, so only the S-12 shows it here
  printedOn?: string;
}) => {
  const inner = width - CARD.padding * 2;
  const mapHeight = height - CARD.mapTop - CARD.footerHeight;

  return (
    <View
      style={{
        width,
        height,
        backgroundColor: '#FFFFFF',
        paddingLeft: CARD.padding,
        paddingRight: CARD.padding,
      }}
    >
      <View
        style={{
          height: CARD.mapTop,
          paddingTop: 9,
          flexDirection: 'row',
        }}
      >
        <Text>
          <Text style={[styles.frameTitle, { fontSize: 11 }]}>
            {tx('Territory Map Card')}
            {'\u2002'}
          </Text>
          <Text style={[styles.frameName, { fontSize: 11 }]}>
            {titleOf(territory)}
          </Text>
        </Text>
      </View>

      <View
        style={{
          position: 'relative',
          width: inner,
          height: mapHeight,
        }}
      >
        {territory.type === 'phone' && (
          <PhoneGrid
            numbers={territory.phoneNumbers ?? []}
            blocked={territory.doNotCalls.map((entry) => entry.address)}
            width={inner}
          />
        )}

        {territory.type !== 'phone' && territory.mapImage && (
          <Image
            src={territory.mapImage}
            style={{
              width: inner,
              height: mapHeight,
              objectFit: 'cover',
              borderRadius: 6,
            }}
          />
        )}

        {territory.type !== 'phone' && !territory.mapImage && (
          <View
            style={{
              width: inner,
              height: mapHeight,
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

        {territory.type !== 'phone' && (
          <View
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              flexDirection: 'row',
              gap: 4,
            }}
          >
            {territory.warning && (
              <WarningChip text={territory.warning} radius={4} />
            )}
            {printedOn && (
              <MapBadge text={tx('Printed on {{date}}', { date: printedOn })} />
            )}
            {territory.showHouseholds !== false && territory.households > 0 && (
              <MapBadge
                text={tx('Households: {{n}}', { n: territory.households })}
              />
            )}
          </View>
        )}
      </View>

      <View style={{ height: CARD.footerHeight, justifyContent: 'center' }}>
        <Text style={[styles.a5CareMessage, { width: inner }]}>
          {tx(
            'Please keep this card in the envelope. Do not soil, mark, or bend it. Each time the territory is covered, please inform the brother who cares for the territory files.'
          )}
        </Text>
      </View>
    </View>
  );
};

export default CardFront;
