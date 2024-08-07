import { Text, View } from '@react-pdf/renderer';
import { S140SourceComplexType } from './index.types';
import styles from './index.styles';

const S140SourceComplex = ({
  source,
  time,
  bulletColor,
  partLabel,
}: S140SourceComplexType) => {
  return (
    <View
      style={{
        width: '270px',
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: '-1px',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        <Text style={{ ...styles.bulletPoint, color: bulletColor }}>
          {'\u2022'}
        </Text>
        <Text style={styles.meetingPartText}>
          {source} <Text style={{ fontSize: '8px' }}>({time})</Text>
        </Text>
      </View>
      <Text
        style={{
          ...styles.miniLabelBase,
          marginTop: '3px',
          textAlign: 'right',
        }}
      >
        {partLabel}
      </Text>
    </View>
  );
};

export default S140SourceComplex;
