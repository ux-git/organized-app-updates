import { Text, View } from '@react-pdf/renderer';
import { DoNotCall } from '@definition/territory';
import styles, { COLORS } from '../index.styles';
import { tx } from '@services/i18n/translation';

const cells = {
  wide: { flexGrow: 2, flexBasis: 0 },
  date: { width: 54 },
};

// only the lines that carry an address are drawn, so a short list stays short
// a phone territory lists numbers, which have no householder name
const DoNotCallTable = ({
  entries,
  phone = false,
}: {
  entries: DoNotCall[];
  phone?: boolean;
}) => (
  <View>
    <View
      style={{ flexDirection: 'row', gap: 8, paddingTop: 4, paddingBottom: 4 }}
    >
      <Text style={[styles.columnTitle, cells.wide]}>
        {phone ? tx('Number') : tx('Address')}
      </Text>
      {!phone && (
        <Text style={[styles.columnTitle, cells.wide]}>{tx('Name')}</Text>
      )}
      <Text style={[styles.columnTitle, cells.date]}>{tx('Date')}</Text>
    </View>

    {entries.map((entry) => (
      <View key={entry.id} style={[styles.row, { gap: 8 }]}>
        <Text style={[styles.rowAddress, cells.wide]}>{entry.address}</Text>
        {!phone && (
          <Text style={[styles.rowText, cells.wide]}>{entry.name ?? ''}</Text>
        )}
        <Text style={[styles.rowText, cells.date]}>{entry.date}</Text>
      </View>
    ))}
  </View>
);

export const DoNotCallChip = () => (
  <View style={[styles.chip, { backgroundColor: COLORS.dncChip }]}>
    <Text style={[styles.chipText, { color: COLORS.dncText }]}>
      {tx('Do not call')}
    </Text>
  </View>
);

// a card has room for so many lines; what does not fit is at least counted
export const MoreEntries = ({ count }: { count: number }) =>
  count > 0 ? (
    <Text style={[styles.fine, { marginTop: 4 }]}>
      {tx('+{{n}} more in the Organized app', { n: count })}
    </Text>
  ) : null;

export default DoNotCallTable;
