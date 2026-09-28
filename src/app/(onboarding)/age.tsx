import { router } from 'expo-router';
import { ArrowRight, ShieldCheck } from 'lucide-react-native';
import { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Button, Chip, Text } from '@/components/ui';
import { useHaptics } from '@/lib/haptics';
import { useAccount } from '@/state/AccountProvider';
import { useApp } from '@/state/AppState';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';

/** Years between a birth date and today (full years). */
function ageOn(birth: Date, today: Date): number {
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function parseBirthDate(day: string, month: string, year: string): Date | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  // Rejects dates like 31 February.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  if (date.getTime() > Date.now()) return null;
  return date;
}

/**
 * 18+ gate. We never store the birth date, only the time the user
 * confirmed being an adult (profiles.age_confirmed_at).
 */
export default function AgeGate() {
  const { t } = useTranslation();
  const { updateProfile, deleteAccount } = useAccount();
  const { update } = useApp();
  const haptics = useHaptics();
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const complete = day.length > 0 && month.length > 0 && year.length === 4;

  const submit = async () => {
    const birth = parseBirthDate(day, month, year);
    if (!birth) {
      haptics('error');
      setError(t('age.invalid'));
      return;
    }
    setError(null);
    setBusy(true);

    if (ageOn(birth, new Date()) < 18) {
      // Remember on this device, and remove the account that was just created.
      update({ ageBlocked: true, pendingHustleId: null, quizDraft: {} });
      await deleteAccount();
      setBusy(false);
      router.replace('/blocked');
      return;
    }

    const result = await updateProfile({ age_confirmed_at: new Date().toISOString() });
    setBusy(false);
    if (!result.ok) {
      haptics('error');
      setError(t('common.offline'));
      return;
    }
    haptics('success');
    router.push('/consent');
  };

  return (
    <Screen
      header={<StepHeader title={t('age.kicker')} />}
      gap={space[4]}
      footer={<Button label={t('age.cta')} iconRight={ArrowRight} onPress={submit} disabled={!complete} loading={busy} haptic={null} />}>
      <Chip label={t('welcome.badgeAge')} icon={ShieldCheck} tone="accent" />
      <Text variant="h1">{t('age.title')}</Text>
      <Text variant="body" tone="secondary">
        {t('age.body')}
      </Text>

      <View style={styles.row}>
        <DateField value={day} onChange={setDay} placeholder="DD" max={2} width={72} label={t('age.day')} invalid={!!error} nextRef={monthRef} />
        <DateField value={month} onChange={setMonth} placeholder="MM" max={2} width={72} label={t('age.month')} invalid={!!error} inputRef={monthRef} nextRef={yearRef} />
        <DateField value={year} onChange={setYear} placeholder="YYYY" max={4} width={108} label={t('age.year')} invalid={!!error} inputRef={yearRef} />
      </View>

      {error ? (
        <Text variant="bodySm" tone="danger">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

function DateField({
  value,
  onChange,
  placeholder,
  max,
  width,
  label,
  invalid,
  inputRef,
  nextRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max: number;
  width: number;
  label: string;
  invalid: boolean;
  inputRef?: RefObject<TextInput | null>;
  /** Field to jump to once this one is full. */
  nextRef?: RefObject<TextInput | null>;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(v) => {
          const digits = v.replace(/\D/g, '').slice(0, max);
          onChange(digits);
          if (digits.length === max) nextRef?.current?.focus();
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType="number-pad"
        maxLength={max}
        maxFontSizeMultiplier={1.4}
        accessibilityLabel={label}
        style={[styles.input, { width, backgroundColor: colors.recessed, borderColor: invalid ? colors.danger : colors.borderStrong, color: colors.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space[3],
  },
  field: {
    gap: space[2],
  },
  input: {
    minHeight: 56,
    paddingVertical: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    textAlign: 'center',
    fontFamily: fonts.monoSemibold,
    fontSize: 22,
  },
});
