import { router } from 'expo-router';
import { CircleAlert, CircleCheck, Eye, Info, Loader, RefreshCw, Sparkles, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { PromoComposer } from '@/components/admin/PromoComposer';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { BottomSheet, Button, Card, Chip, EmptyState, Icon, IconButton, Row, SectionHeader, Text } from '@/components/ui';
import { useLanguage } from '@/i18n/LanguageProvider';
import { callFunction } from '@/lib/ai';
import type { AiJobRow, RoadmapRow } from '@/lib/database.types';
import { formatDate, formatTime } from '@/lib/format';
import { useL } from '@/lib/l10n';
import { parseRoadmap, type Roadmap } from '@/lib/roadmap';
import { supabase } from '@/lib/supabase';
import { useAccount } from '@/state/AccountProvider';
import { useHustles } from '@/state/HustlesProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type RoadmapMeta = Pick<RoadmapRow, 'id' | 'hustle_id' | 'locale' | 'version' | 'status' | 'created_at'>;
const LOCALES = ['en', 'pl'] as const;

/**
 * Admins only: AI-generated DRAFT base roadmaps (generate-roadmap Edge
 * Function). Review a draft, then approve it to make it the base roadmap
 * for everyone on that hustle in that language (newest approved wins).
 * Everything here is also protected on the server (admin-only policies).
 */
export default function Admin() {
  const { t } = useTranslation();
  const l = useL();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { profile, mode } = useAccount();
  const { hustles } = useHustles();
  const [rows, setRows] = useState<RoadmapMeta[]>([]);
  const [jobs, setJobs] = useState<AiJobRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ meta: RoadmapMeta; roadmap: Roadmap } | null>(null);

  const allowed = mode === 'supabase' && !!profile?.is_admin;

  const fetchAll = useCallback(async () => {
    if (!supabase) return null;
    const [roadmaps, recent] = await Promise.all([
      supabase.from('roadmaps').select('id, hustle_id, locale, version, status, created_at').order('version', { ascending: false }),
      supabase.from('ai_jobs').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    return { roadmaps: roadmaps.data, jobs: recent.data };
  }, []);

  const apply = (result: Awaited<ReturnType<typeof fetchAll>>) => {
    if (result?.roadmaps) setRows(result.roadmaps);
    if (result?.jobs) setJobs(result.jobs);
  };
  const load = () => fetchAll().then(apply);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    fetchAll()
      .then((result) => {
        if (!cancelled) apply(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // `apply` only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, fetchAll]);

  const running = jobs.some((j) => j.status === 'running');
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      fetchAll()
        .then(apply)
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(timer);
    // `apply` only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, fetchAll]);

  if (!allowed) {
    return (
      <Screen header={<StepHeader title={t('admin.title')} />}>
        <EmptyState icon={CircleAlert} title={t('admin.onlyTitle')} body={t('admin.onlyBody')} action={{ label: t('common.back'), onPress: () => router.back() }} />
      </Screen>
    );
  }

  const generate = async (hustleId: string, locale: 'en' | 'pl') => {
    setBusy(`${hustleId}:${locale}`);
    const result = await callFunction('generate-roadmap', { hustle_id: hustleId, locale });
    setBusy(null);
    if (!result.ok) Alert.alert(t('admin.failed'), result.error);
    else Alert.alert(t('admin.startedTitle'), t('admin.startedBody'));
    load().catch(() => {});
  };

  const openPreview = async (meta: RoadmapMeta) => {
    if (!supabase) return;
    const { data } = await supabase.from('roadmaps').select('content').eq('id', meta.id).single();
    const roadmap = parseRoadmap(data?.content);
    if (roadmap) setPreview({ meta, roadmap });
    else Alert.alert(t('admin.invalid'));
  };

  const approve = (meta: RoadmapMeta) => {
    Alert.alert(t('admin.approveTitle'), t('admin.approveBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.approve'),
        onPress: async () => {
          const { error } = await supabase!.from('roadmaps').update({ status: 'approved' }).eq('id', meta.id);
          if (error) Alert.alert(t('admin.failed'), error.message);
          setPreview(null);
          load().catch(() => {});
        },
      },
    ]);
  };

  const remove = (meta: RoadmapMeta) => {
    Alert.alert(t('admin.deleteTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('admin.delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase!.from('roadmaps').delete().eq('id', meta.id);
          if (error) Alert.alert(t('admin.failed'), error.message);
          setPreview(null);
          load().catch(() => {});
        },
      },
    ]);
  };

  const hustleName = (id: string | null) => {
    const h = hustles.find((x) => x.id === id);
    return h ? l(h.name) : '—';
  };

  return (
    <Screen header={<StepHeader title={t('admin.title')} right={<IconButton icon={RefreshCw} size={36} accessibilityLabel={t('admin.refresh')} onPress={() => load()} />} />} gap={space[3]}>
      <Card variant="highlight">
        <Row align="flex-start">
          <Icon icon={Info} size={18} tone="accent" />
          <Text variant="bodySm" tone="secondary" style={styles.flex}>
            {t('admin.intro')}
          </Text>
        </Row>
      </Card>

      <PromoComposer />

      {jobs.length ? (
        <>
          <SectionHeader label={t('admin.jobs')} style={styles.section} />
          <Card padding={space[3]}>
            {jobs.map((job, i) => (
              <View key={job.id} style={[styles.jobRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
                <Row gap={space[2]}>
                  <Icon icon={job.status === 'done' ? CircleCheck : job.status === 'failed' ? CircleAlert : Loader} size={16} tone={job.status === 'failed' ? 'danger' : 'accent'} />
                  <Text variant="bodySm" weight="medium" style={styles.flex} numberOfLines={1}>
                    {hustleName(job.hustle_id)} · {job.locale?.toUpperCase()}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {formatDate(new Date(job.created_at), language)} {formatTime(new Date(job.created_at), language)}
                  </Text>
                </Row>
                {job.error ? (
                  <Text variant="caption" tone="danger" numberOfLines={3}>
                    {job.error}
                  </Text>
                ) : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader label={t('admin.hustles')} style={styles.section} />
      {hustles.map((h) => (
        <Card key={h.id} padding={space[4]}>
          <Text variant="body" weight="semibold">
            {l(h.name)}
          </Text>
          {LOCALES.map((locale) => {
            const versions = rows.filter((r) => r.hustle_id === h.id && r.locale === locale);
            const live = versions.find((r) => r.status === 'approved');
            const drafts = versions.filter((r) => r.status === 'draft');
            const key = `${h.id}:${locale}`;
            return (
              <View key={locale} style={styles.localeBlock}>
                <Row style={styles.between}>
                  <Row gap={space[2]}>
                    <Chip label={locale.toUpperCase()} />
                    <Text variant="caption" tone="secondary">
                      {live ? t('admin.live', { version: live.version }) : t('admin.noLive')}
                    </Text>
                  </Row>
                  <Button
                    label={t('admin.generate')}
                    icon={Sparkles}
                    size="sm"
                    variant="secondary"
                    fullWidth={false}
                    loading={busy === key}
                    disabled={!!busy || jobs.some((j) => j.status === 'running' && j.hustle_id === h.id && j.locale === locale)}
                    onPress={() => generate(h.id, locale)}
                  />
                </Row>
                {drafts.map((d) => (
                  <Row key={d.id} gap={space[2]} style={[styles.draft, { backgroundColor: colors.recessed, borderColor: colors.border }]}>
                    <Text variant="bodySm" style={styles.flex}>
                      {t('admin.draft', { version: d.version, date: formatDate(new Date(d.created_at), language) })}
                    </Text>
                    <IconButton icon={Eye} size={32} accessibilityLabel={t('admin.preview')} onPress={() => openPreview(d)} />
                    <IconButton icon={Trash2} size={32} accessibilityLabel={t('admin.delete')} onPress={() => remove(d)} />
                  </Row>
                ))}
              </View>
            );
          })}
        </Card>
      ))}

      <BottomSheet visible={!!preview} onClose={() => setPreview(null)} title={preview ? t('admin.previewTitle', { version: preview.meta.version }) : ''} subtitle={preview ? hustleName(preview.meta.hustle_id) : undefined}>
        {preview ? (
          <>
            <Text variant="caption" tone="secondary">
              {t('admin.previewMeta', {
                weeks: preview.roadmap.total_weeks,
                steps: preview.roadmap.phases.reduce((n, p) => n + p.steps.length, 0),
                metrics: preview.roadmap.weekly_metrics.join(', '),
              })}
            </Text>
            {preview.roadmap.phases.map((p) => (
              <View key={p.id} style={styles.previewPhase}>
                <Text variant="label" tone="accent">
                  {p.id} · {p.weeks} · {p.title}
                </Text>
                {p.steps.map((s) => (
                  <Text key={s.id} variant="bodySm">
                    {s.id} · {s.title} ({s.xp} XP, {s.est_minutes} min{s.tools.length ? ` · ${s.tools.map((x) => x.name).join(', ')}` : ''})
                  </Text>
                ))}
              </View>
            ))}
            {preview.roadmap.earning_milestones.map((m, i) => (
              <Text key={i} variant="caption" tone="secondary">
                {m.label}: {m.range}. {m.note}
              </Text>
            ))}
            <Button label={t('admin.approve')} icon={CircleCheck} onPress={() => approve(preview.meta)} />
            <Button label={t('admin.delete')} icon={Trash2} variant="danger" size="md" onPress={() => remove(preview.meta)} />
          </>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  between: {
    justifyContent: 'space-between',
  },
  section: {
    marginTop: space[3],
  },
  jobRow: {
    gap: 4,
    paddingVertical: space[2],
  },
  localeBlock: {
    gap: space[2],
    marginTop: space[3],
  },
  draft: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingLeft: space[3],
    paddingVertical: 4,
    paddingRight: 4,
  },
  previewPhase: {
    gap: 4,
    marginTop: space[2],
  },
});
