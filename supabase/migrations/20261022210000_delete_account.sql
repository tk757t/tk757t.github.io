-- 4 Mules : suppression de son propre compte. La ligne auth.users part avec ses identités (dont Discord) ; toutes les tables du jeu
-- référencent auth.users en "on delete cascade" (profil et pseudo, partie, journal d'actions, messages, blocages, signalements,
-- file d'attente, présence, parties publiques), le pseudo est donc libéré aussitôt. Les journaux d'administration gardent la ligne
-- sans l'acteur ("on delete set null"). L'appelant ne peut supprimer que son propre compte.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Connexion requise.' using errcode = 'P0001';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
