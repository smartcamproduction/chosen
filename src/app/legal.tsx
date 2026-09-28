import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Brain, ExternalLink, FileText, Link2, Mail, Shield, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Disclaimer } from '@/components/Disclaimer';
import { Screen } from '@/components/Screen';
import { StepHeader } from '@/components/StepHeader';
import { Button, Card, Icon, IconTile, ListRow, Row, Text } from '@/components/ui';
import { ANTHROPIC_PRIVACY_URL, APPLE_EULA_URL, PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/config';
import { space } from '@/theme/tokens';

type Doc = 'terms' | 'privacy' | 'ai' | 'affiliate';

const DOCS: Record<Doc, { icon: LucideIcon; sections: number; url?: string }> = {
  terms: { icon: FileText, sections: 7, url: TERMS_URL },
  privacy: { icon: Shield, sections: 7, url: PRIVACY_URL },
  ai: { icon: Brain, sections: 4, url: ANTHROPIC_PRIVACY_URL },
  affiliate: { icon: Link2, sections: 2 },
};

/**
 * Terms, Privacy, AI and affiliate disclosure: a plain-language summary in
 * the app, with a link to the full document on the website.
 *   /legal?doc=terms | privacy | ai | affiliate
 */
export default function Legal() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ doc?: string }>();
  const doc: Doc = params.doc === 'privacy' || params.doc === 'ai' || params.doc === 'affiliate' ? params.doc : 'terms';
  const { icon, sections, url } = DOCS[doc];
  const open = (link: string) => WebBrowser.openBrowserAsync(link).catch(() => {});

  return (
    <Screen header={<StepHeader title={t(`legal.${doc}.title`)} />} gap={space[3]}>
      <Row align="flex-start">
        <IconTile icon={icon} size={44} />
        <View style={styles.flex}>
          <Text variant="h2">{t(`legal.${doc}.title`)}</Text>
          <Text variant="bodySm" tone="secondary">
            {t(`legal.${doc}.intro`)}
          </Text>
        </View>
      </Row>

      {Array.from({ length: sections }, (_, i) => (
        <Card key={i} padding={space[4]}>
          <Text variant="body" weight="semibold" accessibilityRole="header">
            {t(`legal.${doc}.s${i + 1}Title` as 'legal.terms.s1Title', { email: SUPPORT_EMAIL })}
          </Text>
          <Text variant="bodySm" tone="secondary" style={styles.mt4}>
            {t(`legal.${doc}.s${i + 1}Body` as 'legal.terms.s1Body', { email: SUPPORT_EMAIL })}
          </Text>
        </Card>
      ))}

      {url ? <Button label={t(`legal.${doc}.full`)} iconRight={ExternalLink} variant="secondary" onPress={() => open(url)} /> : null}
      {doc === 'terms' ? <Button label={t('legal.terms.appleEula')} iconRight={ExternalLink} variant="ghost" size="md" onPress={() => open(APPLE_EULA_URL)} /> : null}

      <Card padding={space[3]}>
        <ListRow icon={Mail} title={t('legal.contact')} sub={SUPPORT_EMAIL} chevron onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})} />
      </Card>

      <Row gap={space[2]} style={styles.center}>
        <Icon icon={Shield} size={12} tone="tertiary" />
        <Text variant="caption" tone="tertiary">
          {t('legal.updated')}
        </Text>
      </Row>
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  mt4: {
    marginTop: 4,
  },
  center: {
    alignSelf: 'center',
  },
});
