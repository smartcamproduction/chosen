-- =====================================================================
-- Chosen · Phase 3: machine, choosing, commitment lock
--
-- HOW TO USE: run AFTER the Phase 2 file. Supabase → SQL Editor → New
-- query → paste this whole file → Run. Safe to run again.
--
--   • hustles: typical monthly earnings range as numbers (for the chip)
--   • choose_hustle(): replacing a hustle whose 30 days are over now needs
--     explicit confirmation, and the old one is marked 'abandoned'
--   • the 15 hustles are (re)seeded here
-- =====================================================================

alter table public.hustles
  add column if not exists earning_min_usd integer,
  add column if not exists earning_max_usd integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hustles_earning_range_check') then
    alter table public.hustles
      add constraint hustles_earning_range_check
      check (earning_min_usd is null or earning_max_usd is null
             or (earning_min_usd >= 0 and earning_max_usd >= earning_min_usd));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- choose_hustle v2
--   slot free                 → new hustle, locked for 30 days
--   slot locked (< 30 days)   → only with a Fast Pivot credit
--   slot unlocked (≥ 30 days) → only when p_replace_current = true
--   in both replace cases the previous hustle becomes 'abandoned'
-- ---------------------------------------------------------------------
drop function if exists public.choose_hustle(uuid, integer, boolean);

create or replace function public.choose_hustle(
  p_hustle_id          uuid,
  p_slot               integer default 1,
  p_use_fast_pivot     boolean default false,
  p_replace_current    boolean default false
)
returns public.user_hustles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_profile  public.profiles;
  v_current  public.user_hustles;
  v_new      public.user_hustles;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'profile_missing';
  end if;
  if v_profile.age_confirmed_at is null then
    raise exception 'age_not_confirmed';
  end if;
  if p_slot not in (1, 2) then
    raise exception 'invalid_slot';
  end if;
  if p_slot = 2 and v_profile.tier <> 'elite' then
    raise exception 'elite_required';
  end if;
  if not exists (select 1 from public.hustles h where h.id = p_hustle_id and h.is_active) then
    raise exception 'hustle_not_available';
  end if;
  if exists (select 1 from public.user_hustles uh
             where uh.user_id = v_uid and uh.status = 'active'
               and uh.slot <> p_slot and uh.hustle_id = p_hustle_id) then
    raise exception 'already_active_in_other_slot';
  end if;

  select * into v_current
  from public.user_hustles uh
  where uh.user_id = v_uid and uh.slot = p_slot and uh.status = 'active'
  for update;

  if found then
    if v_current.lock_until > now() then
      if not p_use_fast_pivot then
        raise exception 'locked';
      end if;
      update public.credits
         set fast_pivot_credits = fast_pivot_credits - 1
       where user_id = v_uid and fast_pivot_credits > 0;
      if not found then
        raise exception 'no_fast_pivot_credits';
      end if;
    elsif not p_replace_current then
      raise exception 'confirm_replace_required';
    end if;
    update public.user_hustles set status = 'abandoned' where id = v_current.id;
  end if;

  insert into public.user_hustles (user_id, hustle_id, slot)
  values (v_uid, p_hustle_id, p_slot)
  returning * into v_new;

  insert into public.spins (user_id, hustle_id, chosen) values (v_uid, p_hustle_id, true);

  return v_new;
end;
$$;

revoke all on function public.choose_hustle(uuid, integer, boolean, boolean) from public, anon;
grant execute on function public.choose_hustle(uuid, integer, boolean, boolean) to authenticated;

-- =====================================================================
-- SEED: the 15 hustles
-- =====================================================================

-- BEGIN HUSTLE SEED (generated from src/data/hustles.seed.json by scripts/generate-hustle-seed.js)
insert into public.hustles (slug, name_en, name_pl, summary_en, summary_pl, hours_per_week_min, hours_per_week_max, startup_cost_min, startup_cost_max, earning_range_en, earning_range_pl, earning_min_usd, earning_max_usd, difficulty, icon) values
  ('print-on-demand', 'Print on Demand (Printful + Etsy)', 'Print on demand (Printful + Etsy)', 'Design T-shirts, mugs and posters for a specific niche and sell them on Etsy. Printful prints and ships every order, so you never hold stock.', 'Projektuj koszulki, kubki i plakaty dla konkretnej niszy i sprzedawaj je na Etsy. Printful drukuje i wysyła każde zamówienie, więc nie trzymasz towaru.', 5, 10, 0, 100, 'Usually $0–$200/mo in the first 3 months. Shops with 50+ well-targeted listings often reach $300–$1,500/mo after 6–12 months.', 'Zwykle 0–200 $/mies. przez pierwsze 3 miesiące. Sklepy z 50+ dobrze dobranymi ofertami często osiągają 300–1500 $/mies. po 6–12 miesiącach.', 300, 1500, 3, 'shirt'),
  ('etsy-digital-products', 'Digital Products on Etsy', 'Produkty cyfrowe na Etsy', 'Create printable planners, trackers, wall art or wedding templates once and sell them as instant downloads on Etsy.', 'Stwórz raz planery do druku, trackery, grafiki na ścianę lub szablony ślubne i sprzedawaj je na Etsy jako pliki do pobrania.', 5, 10, 0, 50, 'Usually $0–$150/mo in the first 3 months. A catalog of 30+ products can bring $200–$1,000/mo after 6–12 months.', 'Zwykle 0–150 $/mies. przez pierwsze 3 miesiące. Katalog 30+ produktów może dać 200–1000 $/mies. po 6–12 miesiącach.', 200, 1000, 2, 'file-down'),
  ('notion-canva-templates', 'Notion & Canva Templates', 'Szablony Notion i Canva', 'Build ready-to-use Notion workspaces and Canva designs for students, creators or small businesses, and sell them on Gumroad, Etsy or the Notion marketplace.', 'Twórz gotowe przestrzenie Notion i projekty Canva dla studentów, twórców lub małych firm i sprzedawaj je na Gumroad, Etsy albo w marketplace Notion.', 5, 10, 0, 30, 'Usually $0–$200/mo early on. Sellers who promote on social media often reach $200–$1,500/mo within 6–12 months.', 'Zwykle 0–200 $/mies. na początku. Sprzedawcy promujący się w social mediach często dochodzą do 200–1500 $/mies. w ciągu 6–12 miesięcy.', 200, 1500, 2, 'layout-template'),
  ('faceless-youtube', 'Faceless YouTube Channel', 'Kanał YouTube bez twarzy', 'Publish voice-over videos (explainers, lists, stories) in one evergreen niche. Income comes from ads, affiliate links and sponsors once the channel grows.', 'Publikuj filmy z lektorem (objaśnienia, rankingi, historie) w jednej ponadczasowej niszy. Zarabiasz na reklamach, linkach afiliacyjnych i sponsorach, gdy kanał urośnie.', 10, 15, 0, 150, 'Often $0 for the first 3–6 months (ads need 1,000 subscribers and 4,000 watch hours). Growing channels typically make $100–$2,000/mo after that.', 'Często 0 $ przez pierwsze 3–6 miesięcy (reklamy wymagają 1000 subskrypcji i 4000 godzin oglądania). Rosnące kanały zwykle zarabiają potem 100–2000 $/mies.', 100, 2000, 4, 'clapperboard'),
  ('faceless-short-video', 'Faceless TikTok & Reels', 'TikTok i Reels bez twarzy', 'Post short faceless videos (tips, stories, product demos) on TikTok and Instagram Reels, then earn through affiliate links, creator programs and brand deals.', 'Publikuj krótkie filmy bez twarzy (porady, historie, prezentacje produktów) na TikToku i Instagram Reels, a zarabiaj na linkach afiliacyjnych, programach dla twórców i współpracach.', 5, 10, 0, 50, 'Usually $0–$200/mo in the first 3 months. Accounts with steady views can reach $300–$2,000/mo from affiliates and brand deals.', 'Zwykle 0–200 $/mies. przez pierwsze 3 miesiące. Konta ze stabilnymi wyświetleniami mogą dojść do 300–2000 $/mies. z afiliacji i współprac.', 300, 2000, 3, 'smartphone'),
  ('newsletter', 'Newsletter (Beehiiv / Substack)', 'Newsletter (Beehiiv / Substack)', 'Write a weekly email for one specific audience. Once you have readers, earn from sponsors, Beehiiv''s ad network or paid subscriptions.', 'Pisz cotygodniowy e-mail dla jednej konkretnej grupy odbiorców. Gdy zbierzesz czytelników, zarabiaj na sponsorach, sieci reklamowej Beehiiv lub płatnych subskrypcjach.', 5, 10, 0, 50, 'Usually $0 until about 1,000 subscribers. After that, $100–$1,500/mo from sponsors and ads is realistic.', 'Zwykle 0 $ do około 1000 subskrybentów. Potem realne jest 100–1500 $/mies. ze sponsorów i reklam.', 100, 1500, 3, 'newspaper'),
  ('pinterest-affiliate', 'Pinterest Affiliate Marketing', 'Marketing afiliacyjny na Pintereście', 'Create pins that link to products you recommend (through Amazon Associates or other affiliate programs) and earn a commission on every sale.', 'Twórz piny z linkami do polecanych produktów (przez Amazon Associates lub inne programy afiliacyjne) i zarabiaj prowizję od każdej sprzedaży.', 5, 10, 0, 50, 'Usually $0–$100/mo in the first 3 months. Consistent pinners often reach $200–$1,000/mo after 6–12 months.', 'Zwykle 0–100 $/mies. przez pierwsze 3 miesiące. Regularni twórcy pinów często dochodzą do 200–1000 $/mies. po 6–12 miesiącach.', 200, 1000, 2, 'pin'),
  ('niche-affiliate-blog', 'Niche Affiliate Blog', 'Niszowy blog afiliacyjny', 'Write helpful reviews and buying guides in one niche that rank on Google, and earn commissions when readers buy through your links.', 'Pisz pomocne recenzje i poradniki zakupowe w jednej niszy, które pozycjonują się w Google, i zarabiaj prowizje, gdy czytelnicy kupują przez Twoje linki.', 5, 10, 50, 150, 'Usually $0 for the first 6 months while Google builds trust. Well-run blogs often make $200–$2,000/mo after 12–18 months.', 'Zwykle 0 $ przez pierwsze 6 miesięcy, zanim Google nabierze zaufania. Dobrze prowadzone blogi często zarabiają 200–2000 $/mies. po 12–18 miesiącach.', 200, 2000, 4, 'search'),
  ('amazon-kdp', 'Amazon KDP Self-Publishing', 'Self-publishing na Amazon KDP', 'Publish low-content books (journals, puzzle books, planners) or short guides on Amazon Kindle Direct Publishing. Amazon prints and ships on demand.', 'Publikuj książki typu low-content (dzienniki, łamigłówki, planery) lub krótkie poradniki w Amazon Kindle Direct Publishing. Amazon drukuje i wysyła na żądanie.', 5, 10, 0, 100, 'Often $0–$100/mo per title at first. Authors with 10+ titles in a good niche can reach $200–$1,500/mo.', 'Na początku często 0–100 $/mies. na tytuł. Autorzy z 10+ tytułami w dobrej niszy mogą dojść do 200–1500 $/mies.', 200, 1500, 3, 'book-open'),
  ('mini-course', 'Mini Online Course (Gumroad)', 'Mini kurs online (Gumroad)', 'Turn a skill you already have into a short video or PDF course and sell it on Gumroad to people who are one step behind you.', 'Zamień umiejętność, którą już masz, w krótki kurs wideo lub PDF i sprzedawaj go na Gumroad osobom, które są krok za Tobą.', 10, 15, 0, 100, 'A first launch typically brings $0–$500. With a small audience, $200–$2,000/mo is possible.', 'Pierwsza premiera zwykle daje 0–500 $. Z niewielką grupą odbiorców możliwe jest 200–2000 $/mies.', 200, 2000, 3, 'graduation-cap'),
  ('ai-freelancing', 'Freelancing with AI Tools (Fiverr / Upwork)', 'Freelancing z narzędziami AI (Fiverr / Upwork)', 'Offer services like copywriting, design, translation or video editing on Fiverr or Upwork, using AI tools to deliver faster and at higher quality.', 'Oferuj usługi takie jak copywriting, grafika, tłumaczenia czy montaż wideo na Fiverr lub Upwork, używając narzędzi AI, by pracować szybciej i lepiej.', 10, 20, 0, 50, 'Landing the first clients can take 2–6 weeks. After that, $300–$1,500/mo is common, and $2,000+/mo with strong reviews.', 'Zdobycie pierwszych klientów może zająć 2–6 tygodni. Potem częste jest 300–1500 $/mies., a przy dobrych opiniach ponad 2000 $/mies.', 300, 1500, 2, 'briefcase'),
  ('ugc-creator', 'UGC Content for Brands', 'Treści UGC dla marek', 'Film short, authentic videos with products that brands use in their ads and social media. You don''t need followers, just a phone and good light.', 'Nagrywaj krótkie, autentyczne filmy z produktami, które marki wykorzystują w reklamach i social mediach. Nie potrzebujesz obserwujących, tylko telefonu i dobrego światła.', 5, 10, 0, 100, 'First paid videos usually bring $50–$150 each. Creators with steady clients earn $500–$3,000/mo.', 'Pierwsze płatne filmy to zwykle 50–150 $ za sztukę. Twórcy ze stałymi klientami zarabiają 500–3000 $/mies.', 500, 3000, 2, 'camera'),
  ('ai-automations', 'AI Automations for Small Businesses (Make / Zapier)', 'Automatyzacje AI dla małych firm (Make / Zapier)', 'Set up automations that save local businesses time: lead forms, follow-up emails, invoices and reports, built with Make or Zapier plus AI.', 'Wdrażaj automatyzacje, które oszczędzają czas lokalnym firmom: formularze leadów, maile z przypomnieniami, faktury i raporty, zbudowane w Make lub Zapier z pomocą AI.', 10, 15, 0, 50, 'Early projects typically pay $200–$1,000 each. With 2–4 monthly clients, $1,000–$4,000/mo is realistic.', 'Pierwsze projekty to zwykle 200–1000 $ za sztukę. Przy 2–4 stałych klientach realne jest 1000–4000 $/mies.', 1000, 4000, 4, 'workflow'),
  ('stock-media', 'Stock Photos & Videos', 'Zdjęcia i filmy stockowe', 'Shoot photos and short clips that businesses need and license them on Adobe Stock, Shutterstock or Pond5. Each file can sell many times.', 'Rób zdjęcia i krótkie ujęcia, których potrzebują firmy, i licencjonuj je w Adobe Stock, Shutterstock lub Pond5. Każdy plik może sprzedać się wiele razy.', 5, 10, 0, 300, 'Usually $0–$50/mo in the first months. Portfolios of 500+ strong files often bring $100–$800/mo.', 'Zwykle 0–50 $/mies. w pierwszych miesiącach. Portfolio z 500+ dobrymi plikami często daje 100–800 $/mies.', 100, 800, 2, 'image'),
  ('social-media-manager', 'Remote Social Media Manager', 'Zdalny social media manager', 'Plan, create and schedule posts for small businesses that have no time for Instagram, Facebook or TikTok, all remotely.', 'Planuj, twórz i publikuj posty dla małych firm, które nie mają czasu na Instagram, Facebooka czy TikToka, w pełni zdalnie.', 10, 20, 0, 50, 'One client typically pays $300–$800/mo. With 2–4 clients, $1,000–$3,000/mo is realistic.', 'Jeden klient płaci zwykle 300–800 $/mies. Przy 2–4 klientach realne jest 1000–3000 $/mies.', 1000, 3000, 2, 'megaphone')
on conflict (slug) do update set
  name_en = excluded.name_en,
  name_pl = excluded.name_pl,
  summary_en = excluded.summary_en,
  summary_pl = excluded.summary_pl,
  hours_per_week_min = excluded.hours_per_week_min,
  hours_per_week_max = excluded.hours_per_week_max,
  startup_cost_min = excluded.startup_cost_min,
  startup_cost_max = excluded.startup_cost_max,
  earning_range_en = excluded.earning_range_en,
  earning_range_pl = excluded.earning_range_pl,
  earning_min_usd = excluded.earning_min_usd,
  earning_max_usd = excluded.earning_max_usd,
  difficulty = excluded.difficulty,
  icon = excluded.icon;
-- END HUSTLE SEED
