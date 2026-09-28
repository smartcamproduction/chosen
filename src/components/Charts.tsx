import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

import { Text } from './ui';

/** Small circular progress (e.g. "Day 12/30"). */
export function ProgressRing({ value, size = 20, stroke = 2.5 }: { value: number; size?: number; stroke?: number }) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.chartMuted} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={colors.accent}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Tiny ascending bars used as a trend hint on the profit card. */
export function MiniBars({ values, highlightFrom = 3 }: { values: number[]; highlightFrom?: number }) {
  const { colors } = useTheme();
  const max = Math.max(...values, 1);
  return (
    <View style={styles.miniBars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            width: 12,
            height: Math.max(8, (v / max) * 44),
            borderRadius: 3,
            backgroundColor: i >= highlightFrom ? colors.accent : colors.chartMuted,
            opacity: i >= highlightFrom ? 0.6 + (0.4 * (i - highlightFrom + 1)) / (values.length - highlightFrom) : 1,
          }}
        />
      ))}
    </View>
  );
}

/** Revenue vs cost bars per week. Future weeks are shown as empty outlines. */
export function WeeklyBars({
  weeks,
  total,
  weekLabel,
}: {
  /** `week` = the real week number for the label (defaults to the position). */
  weeks: { revenue: number; costs: number; week?: number }[];
  total: number;
  weekLabel: (n: number) => string;
}) {
  const lastWeek = weeks.length ? (weeks[weeks.length - 1].week ?? weeks.length) : 0;
  const { colors } = useTheme();
  const max = Math.max(...weeks.map((w) => Math.max(w.revenue, w.costs)), 1);
  const H = 96;
  return (
    <View style={styles.weekly}>
      {Array.from({ length: total }, (_, i) => {
        const w = weeks[i];
        const isCurrent = i === weeks.length - 1;
        return (
          <View key={i} style={styles.weekCol}>
            <View style={[styles.barPair, { height: H }]}>
              {w ? (
                <>
                  <View style={{ width: 20, height: Math.max(4, (w.revenue / max) * H), borderRadius: 4, backgroundColor: colors.accent }} />
                  <View style={{ width: 12, height: Math.max(4, (w.costs / max) * H), borderRadius: 3, backgroundColor: colors.chartCost }} />
                </>
              ) : (
                <View style={{ width: 34, height: H * 0.35, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderActive }} />
              )}
            </View>
            <Text variant="caption" tone={isCurrent ? 'accent' : w ? 'secondary' : 'tertiary'} weight={isCurrent ? 'semibold' : 'regular'}>
              {weekLabel(w ? (w.week ?? i + 1) : lastWeek + (i - weeks.length + 1))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Cumulative profit over the weeks, with a zero line when it dips below 0. */
export function ProfitLine({ values, height = 110 }: { values: number[]; height?: number }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const points = [0, ...values];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const pad = 6;
  const x = (i: number) => (points.length === 1 ? 0 : (i / (points.length - 1)) * width);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${y(min).toFixed(1)} L0 ${y(min).toFixed(1)} Z`;
  const last = points.length - 1;

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={0.28} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {min < 0 ? <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={colors.borderActive} strokeDasharray="4 4" strokeWidth={1} /> : null}
          <Path d={area} fill="url(#profitFill)" />
          <Path d={line} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={x(last)} cy={y(points[last])} r={3.5} fill={colors.accent} />
        </Svg>
      ) : null}
    </View>
  );
}

/** Minimal trend line. */
export function Sparkline({ values, width = 72, height = 24 }: { values: number[]; width?: number; height?: number }) {
  const { colors } = useTheme();
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={colors.accent} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={last[0]} cy={last[1]} r={2.5} fill={colors.accent} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  miniBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    height: 44,
  },
  weekly: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space[2],
  },
  weekCol: {
    flex: 1,
    alignItems: 'center',
    gap: space[2],
  },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
});
