import type { LucideIcon } from 'lucide-react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { toneColor, type TextTone } from './Text';

interface IconProps {
  icon: LucideIcon;
  size?: number;
  tone?: TextTone;
  color?: string;
  strokeWidth?: number;
}

/** Thin line icon (1.5px stroke) colored from the theme. */
export function Icon({ icon: Glyph, size = 20, tone = 'secondary', color, strokeWidth = 1.5 }: IconProps) {
  const { colors } = useTheme();
  return <Glyph size={size} color={color ?? toneColor(colors, tone) ?? colors.textSecondary} strokeWidth={strokeWidth} />;
}
