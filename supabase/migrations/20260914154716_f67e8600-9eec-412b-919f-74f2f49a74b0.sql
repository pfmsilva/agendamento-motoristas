CREATE OR REPLACE FUNCTION public.series_shift(_ts timestamptz, _freq public.recurrence_freq, _n integer)
 RETURNS timestamptz
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select ((_ts at time zone 'Europe/Lisbon')
          + case _freq
              when 'daily' then make_interval(days => _n)
              when 'weekly' then make_interval(days => 7 * _n)
              when 'monthly' then make_interval(months => _n)
              else make_interval(years => _n)
            end) at time zone 'Europe/Lisbon'
$function$;