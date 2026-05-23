BEGIN;

with seed_universities (name, short_name) as (
  values
    ('University of Jos (UNIJOS)', 'UNIJOS'),
    ('Ahmadu Bello University (ABU)', 'ABU'),
    ('University of Nigeria (UNN)', 'UNN'),
    ('Obafemi Awolowo University (OAU)', 'OAU'),
    ('University of Ibadan (UI)', 'UI'),
    ('University of Lagos (UNILAG)', 'UNILAG'),
    ('University of Benin (UNIBEN)', 'UNIBEN'),
    ('University of Ilorin (UNILORIN)', 'UNILORIN'),
    ('Nnamdi Azikiwe University (UNIZIK)', 'UNIZIK'),
    ('University of Port Harcourt (UNIPORT)', 'UNIPORT'),
    ('Bayero University Kano (BUK)', 'BUK'),
    ('University of Maiduguri (UNIMAID)', 'UNIMAID'),
    ('Federal University of Technology Minna (FUT Minna)', 'FUT Minna'),
    ('Other', null)
)
insert into public.universities (name, short_name, country, status)
select
  seed.name,
  seed.short_name,
  'Nigeria',
  'active'
from seed_universities seed
where not exists (
  select 1
  from public.universities existing
  where lower(existing.name) = lower(seed.name)
);

COMMIT;
