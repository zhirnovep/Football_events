-- Выполните этот файл целиком в Supabase: Dashboard -> SQL Editor -> New query -> Run

-- Список ваших друзей (заполняется один раз, потом люди добавляют себя сами при первом заходе)
create table if not exists roster (
  name text primary key,
  created_at timestamptz default now()
);

-- Текущий активный сбор. Всегда одна строка с id = 1.
create table if not exists event_state (
  id int primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Автообновление updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_event_state_updated on event_state;
create trigger trg_event_state_updated
before update on event_state
for each row execute function set_updated_at();

-- Включаем Row Level Security
alter table roster enable row level security;
alter table event_state enable row level security;

-- Это закрытая ссылка для узкого круга друзей, поэтому доступ на чтение/запись
-- открыт всем, кто знает адрес сайта (анонимный ключ). Не используйте эту схему
-- для данных, которые не должны быть публичными при утечке ссылки.
create policy "anyone can read roster" on roster for select using (true);
create policy "anyone can add to roster" on roster for insert with check (true);

create policy "anyone can read event_state" on event_state for select using (true);
create policy "anyone can insert event_state" on event_state for insert with check (true);
create policy "anyone can update event_state" on event_state for update using (true);
create policy "anyone can delete event_state" on event_state for delete using (true);

-- Включаем realtime-обновления для event_state (чтобы список обновлялся у всех сразу)
alter publication supabase_realtime add table event_state;
