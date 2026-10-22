import { Path, Svg, Text, View } from '@react-pdf/renderer';
import styles, { CHIP_HEIGHT, COLORS } from '../index.styles';

// red like the do-not-call marks, with a sign, so it still reads on a black and white print
const WarningChip = ({
  text,
  radius = 2,
}: {
  text: string;
  // the badges over the map are rounder than the label's chips
  radius?: number;
}) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      maxWidth: 230,
      backgroundColor: COLORS.dncChip,
      border: `0.5px solid ${COLORS.dncText}`,
      borderRadius: radius,
      height: CHIP_HEIGHT,
      paddingLeft: 4,
      paddingRight: 5,
    }}
  >
    <Svg width={7} height={7} viewBox="0 0 24 24">
      <Path
        d="M12 3 L22 20 H2 Z"
        fill="none"
        stroke={COLORS.dncText}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <Path
        d="M12 9.5 V14.5 M12 17 V17.4"
        stroke={COLORS.dncText}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
    </Svg>
    <Text
      style={[
        styles.households,
        { fontSize: 7, fontWeight: 600, color: COLORS.dncText },
      ]}
    >
      {text}
    </Text>
  </View>
);

export default WarningChip;
