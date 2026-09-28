import type { RoadmapSource } from '@/lib/roadmap';

import aiAutomations from './ai-automations.json';
import aiFreelancing from './ai-freelancing.json';
import amazonKdp from './amazon-kdp.json';
import etsyDigitalProducts from './etsy-digital-products.json';
import facelessShortVideo from './faceless-short-video.json';
import facelessYoutube from './faceless-youtube.json';
import miniCourse from './mini-course.json';
import newsletter from './newsletter.json';
import nicheAffiliateBlog from './niche-affiliate-blog.json';
import notionCanvaTemplates from './notion-canva-templates.json';
import pinterestAffiliate from './pinterest-affiliate.json';
import printOnDemand from './print-on-demand.json';
import socialMediaManager from './social-media-manager.json';
import stockMedia from './stock-media.json';
import ugcCreator from './ugc-creator.json';

/**
 * The approved base roadmaps (EN + PL) bundled with the app. The database
 * holds the same content (seeded from these files) and wins when online;
 * this copy keeps the roadmap working offline and in preview mode.
 */
export const ROADMAP_SOURCES: Record<string, RoadmapSource> = {
  'ai-automations': aiAutomations,
  'ai-freelancing': aiFreelancing,
  'amazon-kdp': amazonKdp,
  'etsy-digital-products': etsyDigitalProducts,
  'faceless-short-video': facelessShortVideo,
  'faceless-youtube': facelessYoutube,
  'mini-course': miniCourse,
  newsletter,
  'niche-affiliate-blog': nicheAffiliateBlog,
  'notion-canva-templates': notionCanvaTemplates,
  'pinterest-affiliate': pinterestAffiliate,
  'print-on-demand': printOnDemand,
  'social-media-manager': socialMediaManager,
  'stock-media': stockMedia,
  'ugc-creator': ugcCreator,
};
