import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg';
import { findCarArt } from './car-art';

type CarRef = { brand: string; model: string; year: number | null };

/**
 * The vehicle's own illustration when we have one (Claude Design catalog),
 * else a generic hatchback side profile with a faint amber floor glow.
 */
export function CarSilhouette({ width = 350, car }: { width?: number; car?: CarRef }) {
  const height = (width * 110) / 320;
  const art = car ? findCarArt(car) : null;
  if (art) {
    return (
      <View style={[styles.wrap, { height: height + 12 }]}>
        <SvgXml xml={art.svg} width={width} height={height} />
      </View>
    );
  }
  return (
    <View style={[styles.wrap, { height: height + 12 }]}>
      <Svg width={width} height={40} style={styles.glow}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#fbbf24" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#fbbf24" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={width * 0.1} y={0} width={width * 0.8} height={40} fill="url(#glow)" />
      </Svg>
      <Svg width={width} height={height} viewBox="0 0 320 110" fill="none">
        <Defs>
          <LinearGradient id="cbody" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#34302c" />
            <Stop offset="1" stopColor="#1a1816" />
          </LinearGradient>
        </Defs>
        <Ellipse cx={164} cy={105} rx={148} ry={4} fill="#000" opacity={0.6} />
        <Path
          d="M18 80L18 64C18 55 22 49 30 45L54 28C60 24 66 22 76 22L168 22C184 22 196 27 210 37L232 51L272 57C292 60 304 67 306 77L306 82C306 85 304 87 300 87L274 87A24 24 0 0 0 226 87L104 87A24 24 0 0 0 56 87L24 87C20 87 18 84 18 80Z"
          fill="url(#cbody)"
          stroke="#5a544e"
          strokeWidth={1}
        />
        <Path d="M62 30C66 27 70 26 76 26L118 26L118 47L46 47Z" fill="#0c0b0a" stroke="#4a4540" strokeWidth={1} />
        <Path d="M124 26L166 26C180 26 190 30 202 38L216 47L124 47Z" fill="#0c0b0a" stroke="#4a4540" strokeWidth={1} />
        <Path d="M28 62C120 60 210 60 300 66" stroke="#45403b" strokeWidth={1} />
        <Path d="M292 64L303 70" stroke="#f0ede8" strokeWidth={2.5} strokeLinecap="round" />
        <Path d="M19 58L19 66" stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" />
        <Circle cx={80} cy={87} r={18} fill="#0c0b0a" stroke="#5a544e" strokeWidth={1} />
        <Circle cx={80} cy={87} r={9} stroke="#45403b" strokeWidth={1} />
        <Circle cx={250} cy={87} r={18} fill="#0c0b0a" stroke="#5a544e" strokeWidth={1} />
        <Circle cx={250} cy={87} r={9} stroke="#45403b" strokeWidth={1} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-end' },
  glow: { position: 'absolute', bottom: 2 },
});
