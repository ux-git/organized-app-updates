import { Image, Text, View } from '@react-pdf/renderer';
import styles from '../index.styles';
import { tx } from '@services/i18n/translation';

const QrNote = ({
  qrImage,
  printedOn,
}: {
  qrImage?: string;
  printedOn: string;
}) => (
  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
    <View style={{ gap: 8, width: 140 }}>
      <Text style={styles.qrText}>
        {qrImage
          ? tx(
              'The latest info about this area is available in the Organized app. Scan the QR code to view it.'
            )
          : tx(
              'The latest info about this area is available in the Organized app.'
            )}
      </Text>
      <Text style={styles.printedOn}>
        {tx('Printed on {{date}}', { date: printedOn })}
      </Text>
    </View>

    {qrImage && <Image src={qrImage} style={{ width: 60, height: 60 }} />}
  </View>
);

export default QrNote;
