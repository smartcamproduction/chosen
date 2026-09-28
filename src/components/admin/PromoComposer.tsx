import { Megaphone, Send, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Icon, Row, SectionHeader, Segmented, Text } from '@/components/ui';
import { useLanguage } from '@/i18n/LanguageProvider';
import { callFunction } from '@/lib/ai';
import { formatDate, formatTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, space } from '@/theme/tokens';

type Audience = 'all' | 'free' | 'pro' | 'elite';
type Target = '/today' | '/paywall' | '/coach' | '/machine';

interface Campaign {
  id: string;
  title_en: string;
  audience: Audience;
  status: 'sending' | 'sent' | 'failed';
  recipients: number;
  sent: number;
  failed: number;
  created_at: string;
}

/**
 * Admins: send an "Offers & news" notification (promo-push Edge Function).
 * It only reaches people who switched on "Offers & news" in Profile.
 */
export function PromoComposer() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const [titleEn, setTitleEn] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [titlePl, setTitlePl] = useState('');
  const [bodyPl, setBodyPl] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [target, setTarget] = useState<Target>('/today');
  const [busy, setBusy] = useState<'count' | 'send' | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const fetchCampaigns = useCallback(async () => {
    if (!supabase) return [];
    const { data } = await (supabase as unknown as {
      from: (t: string) => { select: (c: string) => { order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: Campaign[] | null }> } } };
    })
      .from('promo_campaigns')
      .select('id, title_en, audience, status, recipients, sent, failed, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    return data ?? [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCampaigns()
      .then((rows) => {
        if (!cancelled) setCampaigns(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchCampaigns]);

  const body = { title_en: titleEn, body_en: bodyEn, title_pl: titlePl, body_pl: bodyPl, audience, url: target };
  const ready = titleEn.trim().length > 0 && bodyEn.trim().length > 0;

  const count = async () => {
    setBusy('count');
    const result = await callFunction<{ recipients: number }>('promo-push', { ...body, dry_run: true });
    setBusy(null);
    if (!result.ok) Alert.alert(t('admin.failed'), result.error);
    else Alert.alert(t('admin.promo.countTitle', { count: result.data.recipients }));
  };

  const send = () => {
    Alert.alert(t('admin.promo.confirmTitle'), t('admin.promo.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.promo.send'),
        onPress: async () => {
          setBusy('send');
          const result = await callFunction<{ recipients: number }>('promo-push', body);
          setBusy(null);
          if (!result.ok) {
            Alert.alert(t('admin.failed'), result.error);
            return;
          }
          Alert.alert(t('admin.promo.sentTitle', { count: result.data.recipients }));
          fetchCampaigns()
            .then(setCampaigns)
            .catch(() => {});
        },
      },
    ]);
  };

  const input = (value: string, onChange: (v: string) => void, label: string, max: number, multiline = false) => (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={label}
      placeholderTextColor={colors.textTertiary}
      maxLength={max}
      multiline={multiline}
      maxFontSizeMultiplier={1.6}
      accessibilityLabel={label}
      style={[styles.input, multiline && styles.multiline, { backgroundColor: colors.recessed, borderColor: colors.borderStrong, color: colors.text }]}
    />
  );

  return (
    <>
      <SectionHeader label={t('admin.promo.title')} style={styles.section} />
      <Card padding={space[4]}>
        <Row gap={space[2]} align="flex-start">
          <Icon icon={Megaphone} size={16} tone="accent" />
          <Text variant="bodySm" tone="secondary" style={styles.flex}>
            {t('admin.promo.intro')}
          </Text>
        </Row>
        <View style={styles.fields}>
          <Text variant="label" tone="secondary">
            English
          </Text>
          {input(titleEn, setTitleEn, t('admin.promo.titleField'), 80)}
          {input(bodyEn, setBodyEn, t('admin.promo.bodyField'), 300, true)}
          <Text variant="label" tone="secondary">
            Polski
          </Text>
          {input(titlePl, setTitlePl, t('admin.promo.titleField'), 80)}
          {input(bodyPl, setBodyPl, t('admin.promo.bodyField'), 300, true)}
          <Text variant="caption" tone="tertiary">
            {t('admin.promo.plHint')}
          </Text>
          <Text variant="label" tone="secondary">
            {t('admin.promo.audience')}
          </Text>
          <Segmented<Audience>
            size="sm"
            value={audience}
            onChange={setAudience}
            options={[
              { value: 'all', label: t('admin.promo.all') },
              { value: 'free', label: t('tiers.free') },
              { value: 'pro', label: t('tiers.pro') },
              { value: 'elite', label: t('tiers.elite') },
            ]}
          />
          <Text variant="label" tone="secondary">
            {t('admin.promo.opens')}
          </Text>
          <Segmented<Target>
            size="sm"
            value={target}
            onChange={setTarget}
            options={[
              { value: '/today', label: t('tabs.today') },
              { value: '/paywall', label: t('admin.promo.plans') },
              { value: '/coach', label: t('tabs.coach') },
              { value: '/machine', label: t('today.machineTitle') },
            ]}
          />
        </View>
        <Row gap={space[2]} style={styles.mt12}>
          <View style={styles.flex}>
            <Button label={t('admin.promo.count')} icon={Users} variant="secondary" size="md" onPress={count} loading={busy === 'count'} disabled={!ready || !!busy} />
          </View>
          <View style={styles.flex}>
            <Button label={t('admin.promo.send')} icon={Send} size="md" onPress={send} loading={busy === 'send'} disabled={!ready || !!busy} />
          </View>
        </Row>
        {campaigns.map((c) => (
          <Row key={c.id} gap={space[2]} style={[styles.campaign, { borderTopColor: colors.divider }]}>
            <Text variant="bodySm" style={styles.flex} numberOfLines={1}>
              {c.title_en}
            </Text>
            <Text variant="caption" tone={c.status === 'failed' ? 'danger' : 'secondary'}>
              {t('admin.promo.stats', { sent: c.sent, total: c.recipients })} · {formatDate(new Date(c.created_at), language)} {formatTime(new Date(c.created_at), language)}
            </Text>
          </Row>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: space[3],
  },
  flex: {
    flex: 1,
  },
  fields: {
    gap: space[2],
    marginTop: space[3],
  },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  mt12: {
    marginTop: space[3],
  },
  campaign: {
    borderTopWidth: 1,
    marginTop: space[2],
    paddingTop: space[2],
  },
});
