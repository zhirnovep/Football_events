import { useEffect, useState, useCallback } from 'react'
import {
  Check, X, HelpCircle, Star, StarOff, Trash2, Clock,
  CalendarDays, Lock, Unlock, Plus, Minus, RefreshCw, Wallet,
  UserPlus, Users, Repeat, Banknote, Crown, Vote
} from 'lucide-react'
import { supabase } from './supabaseClient'
import BallIcon from './BallIcon'

const EVENT_ROW_ID = 1
const SEASON_ROW_ID = 1
const STORAGE_KEY = 'football_my_name'
const SUB_PRICE = 350
const DEFAULT_LOCATION = 'Северный'

function emptyEvent(fields) {
  return {
    location: fields.location || DEFAULT_LOCATION,
    venueType: fields.venueType || 'зал',
    date: fields.date || '',
    startTime: fields.startTime || '19:30',
    endTime: fields.endTime || '20:30',
    isOpen: true,
    createdAt: Date.now(),
    going: {},
    notGoing: {},
    thinking: {},
    guests: []
  }
}

function emptySeason() {
  return { pricePerGame: SUB_PRICE, remainingGames: 0, upcomingDates: [] }
}

function formatDuration(start, end) {
  if (!start || !end) return null
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let minutes = (eh * 60 + em) - (sh * 60 + sm)
  if (minutes < 0) minutes += 24 * 60
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h} ч ${m} мин`
  if (h) return `${h} ч`
  return `${m} мин`
}

function formatDateLabel(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })
}

export default function App() {
  const [myName, setMyName] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [roster, setRoster] = useState([])
  const [newRosterName, setNewRosterName] = useState('')
  const [state, setState] = useState(null)
  const [season, setSeason] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('vote')

  const loadRoster = useCallback(async () => {
    const { data, error } = await supabase.from('roster').select('name, is_priority, is_king, phone, bank').order('name')
    if (!error && data) setRoster(data)
  }, [])

  const loadEvent = useCallback(async () => {
    const { data, error } = await supabase.from('event_state').select('data').eq('id', EVENT_ROW_ID).maybeSingle()
    if (!error) setState(data ? data.data : null)
    setLoading(false)
  }, [])

  const loadSeason = useCallback(async () => {
    const { data, error } = await supabase.from('season_state').select('data').eq('id', SEASON_ROW_ID).maybeSingle()
    if (!error) setSeason(data ? data.data : emptySeason())
  }, [])

  useEffect(() => {
    loadRoster(); loadEvent(); loadSeason()

    const eventChannel = supabase.channel('event_state_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_state', filter: `id=eq.${EVENT_ROW_ID}` },
        payload => {
          if (payload.new && 'data' in payload.new) setState(payload.new.data)
          if (payload.eventType === 'DELETE') setState(null)
        }).subscribe()

    const seasonChannel = supabase.channel('season_state_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'season_state', filter: `id=eq.${SEASON_ROW_ID}` },
        payload => { if (payload.new && 'data' in payload.new) setSeason(payload.new.data) }).subscribe()

    const rosterChannel = supabase.channel('roster_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roster' }, () => loadRoster()).subscribe()

    return () => {
      supabase.removeChannel(eventChannel)
      supabase.removeChannel(seasonChannel)
      supabase.removeChannel(rosterChannel)
    }
  }, [loadRoster, loadEvent, loadSeason])

  const saveState = useCallback(async next => {
    setState(next)
    await supabase.from('event_state').upsert({ id: EVENT_ROW_ID, data: next })
  }, [])

  const saveSeason = useCallback(async next => {
    setSeason(next)
    await supabase.from('season_state').upsert({ id: SEASON_ROW_ID, data: next })
  }, [])

  const pickName = async name => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!roster.some(r => r.name === trimmed)) {
      await supabase.from('roster').insert({ name: trimmed })
      loadRoster()
    }
    localStorage.setItem(STORAGE_KEY, trimmed)
    setMyName(trimmed)
  }

  const switchUser = () => { localStorage.removeItem(STORAGE_KEY); setMyName('') }

  const togglePriority = async name => {
    const r = roster.find(r => r.name === name)
    if (!r) return
    await supabase.from('roster').update({ is_priority: !r.is_priority }).eq('name', name)
    loadRoster()
  }

  const setKing = async name => {
    await supabase.from('roster').update({ is_king: false }).eq('is_king', true)
    if (name) await supabase.from('roster').update({ is_king: true }).eq('name', name)
    loadRoster()
  }

  const updateContact = async (name, field, value) => {
    await supabase.from('roster').update({ [field]: value }).eq('name', name)
    loadRoster()
  }

  const createEvent = async fields => { await saveState(emptyEvent(fields)) }

  const resetEvent = async () => {
    if (!window.confirm('Удалить текущий сбор и начать новый? Действие необратимо для всех.')) return
    setState(null)
    await supabase.from('event_state').delete().eq('id', EVENT_ROW_ID)
  }

  const vote = async kind => {
    if (!myName) return
    const next = structuredClone(state)
    delete next.notGoing[myName]; delete next.thinking[myName]; delete next.going[myName]
    if (kind === 'go') next.going[myName] = { kingPaid: false }
    if (kind === 'notgo') next.notGoing[myName] = { settled: false }
    if (kind === 'think') next.thinking[myName] = true
    await saveState(next)
  }

  const toggleKingPaid = async name => {
    const next = structuredClone(state)
    if (!next.going[name]) return
    next.going[name].kingPaid = !next.going[name].kingPaid
    await saveState(next)
  }

  const addGuest = async guestName => {
    const trimmed = guestName.trim()
    if (!trimmed || !myName) return
    const next = structuredClone(state)
    next.guests = next.guests || []
    next.guests.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: trimmed, addedBy: myName, kingPaid: false })
    await saveState(next)
  }

  const removeGuest = async id => {
    const next = structuredClone(state)
    next.guests = (next.guests || []).filter(g => g.id !== id)
    await saveState(next)
  }

  const toggleGuestKingPaid = async id => {
    const next = structuredClone(state)
    const g = (next.guests || []).find(g => g.id === id)
    if (!g) return
    g.kingPaid = !g.kingPaid
    await saveState(next)
  }

  const toggleSubSettled = async priorityName => {
    const next = structuredClone(state)
    if (!next.notGoing[priorityName]) return
    next.notGoing[priorityName].settled = !next.notGoing[priorityName].settled
    await saveState(next)
  }

  const toggleOpen = async () => {
    const next = structuredClone(state)
    next.isOpen = !next.isOpen
    await saveState(next)
  }

  const updateEventField = async (field, value) => {
    const next = structuredClone(state)
    next[field] = value
    await saveState(next)
  }

  const adjustRemainingGames = async delta => {
    const next = structuredClone(season)
    next.remainingGames = Math.max(0, (next.remainingGames || 0) + delta)
    await saveSeason(next)
  }

  const addUpcomingDate = async dateFields => {
    const next = structuredClone(season)
    next.upcomingDates = next.upcomingDates || []
    next.upcomingDates.push({ id: `${Date.now()}`, ...dateFields })
    next.upcomingDates.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    await saveSeason(next)
  }

  const removeUpcomingDate = async id => {
    const next = structuredClone(season)
    next.upcomingDates = (next.upcomingDates || []).filter(d => d.id !== id)
    await saveSeason(next)
  }

  const createEventFromDate = async d => {
    await createEvent({ location: d.location, venueType: d.venueType, date: d.date, startTime: d.startTime, endTime: d.endTime })
    await removeUpcomingDate(d.id)
    const next = structuredClone(season)
    next.remainingGames = Math.max(0, (next.remainingGames || 0) - 1)
    await saveSeason(next)
  }

  if (loading) return <div className="wrap"><p className="empty">Загрузка…</p></div>

  return (
    <div className="wrap">
      <div className="brand">
        <BallIcon size={34} />
        <div>
          <h1>Сбор на футбол</h1>
          <div className="sub">Общая ссылка для всей компании — не зависит от мессенджера</div>
        </div>
      </div>

      {!myName ? (
        <NameGate roster={roster} newRosterName={newRosterName} setNewRosterName={setNewRosterName} onPick={pickName} />
      ) : (
        <>
          <Whoami name={myName} onSwitch={switchUser} />

          <div className="tabs">
            <button className={`tab ${tab === 'vote' ? 'tab-active' : ''}`} onClick={() => setTab('vote')}>
              <Vote size={15} /> Голосование
            </button>
            <button className={`tab ${tab === 'season' ? 'tab-active' : ''}`} onClick={() => setTab('season')}>
              <CalendarDays size={15} /> Будущие игры
            </button>
            <button className={`tab ${tab === 'priority' ? 'tab-active' : ''}`} onClick={() => setTab('priority')}>
              <Star size={15} /> Приоритет
            </button>
          </div>

          {tab === 'vote' && (
            !state ? (
              <Setup onCreate={createEvent} />
            ) : (
              <Board
                state={state}
                myName={myName}
                roster={roster}
                vote={vote}
                toggleKingPaid={toggleKingPaid}
                addGuest={addGuest}
                removeGuest={removeGuest}
                toggleGuestKingPaid={toggleGuestKingPaid}
                toggleSubSettled={toggleSubSettled}
                toggleOpen={toggleOpen}
                resetEvent={resetEvent}
                updateEventField={updateEventField}
              />
            )
          )}

          {tab === 'season' && (
            <SeasonCard
              season={season}
              adjustRemainingGames={adjustRemainingGames}
              addUpcomingDate={addUpcomingDate}
              removeUpcomingDate={removeUpcomingDate}
              createEventFromDate={createEventFromDate}
              hasActiveEvent={!!state}
            />
          )}

          {tab === 'priority' && (
            <PriorityTab roster={roster} togglePriority={togglePriority} setKing={setKing} updateContact={updateContact} />
          )}
        </>
      )}
    </div>
  )
}

function NameGate({ roster, newRosterName, setNewRosterName, onPick }) {
  return (
    <div className="card">
      <label>Вы кто из списка?</label>
      {roster.length > 0 && (
        <div className="rosterList">
          {roster.map(r => (
            <button key={r.name} className="btn-ghost rosterBtn" onClick={() => onPick(r.name)}>
              {r.is_priority && <Star size={14} className="icon-star" />} {r.name}
            </button>
          ))}
        </div>
      )}
      <label style={{ marginTop: 16 }}>Не нашли себя? Добавьтесь в список</label>
      <div className="row">
        <input type="text" placeholder="Ваше имя" value={newRosterName} onChange={e => setNewRosterName(e.target.value)} />
        <button className="btn-primary" onClick={() => onPick(newRosterName)}><UserPlus size={16} /> Это я</button>
      </div>
      <div className="empty" style={{ marginTop: 10 }}>
        Это устройство запомнит ваш выбор — при следующем заходе по этой же ссылке вводить имя не придётся.
      </div>
    </div>
  )
}

function Whoami({ name, onSwitch }) {
  return (
    <div className="whoami">
      <Users size={14} /> Вы: <b>{name}</b>
      <button className="link" onClick={onSwitch}>не я / сменить</button>
    </div>
  )
}

function SeasonCard({ season, adjustRemainingGames, addUpcomingDate, removeUpcomingDate, createEventFromDate, hasActiveEvent }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ date: '', startTime: '19:30', endTime: '20:30', location: DEFAULT_LOCATION, venueType: 'зал' })

  if (!season) return null
  const dates = season.upcomingDates || []

  return (
    <div className="card season-card">
      <div className="section-title icon-title" style={{ marginTop: 0 }}><Wallet size={15} /> Абонемент</div>
      <div className="row" style={{ alignItems: 'center', marginBottom: 6 }}>
        <div className="stat" style={{ flex: 'none' }}><b>{season.remainingGames || 0}</b>оплаченных игр осталось</div>
        <span className="pm-row">
          <button className="btn-ghost icon-btn" onClick={() => adjustRemainingGames(-1)}><Minus size={16} /></button>
          <button className="btn-ghost icon-btn" onClick={() => adjustRemainingGames(1)}><Plus size={16} /></button>
        </span>
      </div>
      <div className="empty" style={{ marginBottom: 10 }}>Доля одного приоритетного игрока за игру: {SUB_PRICE} ₽</div>

      <div className="section-title icon-title"><CalendarDays size={15} /> Ближайшие даты</div>
      {dates.length ? dates.map(d => (
        <div className="person" key={d.id}>
          <span>{formatDateLabel(d.date)}, {d.startTime}–{d.endTime} · {d.location} ({d.venueType})</span>
          <span className="pm-row">
            {!hasActiveEvent && <button className="link" onClick={() => createEventFromDate(d)}>Создать сбор</button>}
            <button className="icon-btn-ghost" onClick={() => removeUpcomingDate(d.id)}><Trash2 size={14} /></button>
          </span>
        </div>
      )) : <div className="empty">—</div>}

      {!showAdd ? (
        <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => setShowAdd(true)}><Plus size={16} /> Добавить дату</button>
      ) : (
        <div style={{ marginTop: 10 }}>
          <label>Дата</label>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <div className="row">
            <div style={{ flex: 1 }}><label>С</label><input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></div>
            <div style={{ flex: 1 }}><label>До</label><input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} /></div>
          </div>
          <label>Место</label>
          <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
          <div className="row" style={{ marginBottom: 14 }}>
            <button className={`btn-ghost ${form.venueType === 'зал' ? 'active' : ''}`} onClick={() => setForm({ ...form, venueType: 'зал' })}>Зал</button>
            <button className={`btn-ghost ${form.venueType === 'улица' ? 'active' : ''}`} onClick={() => setForm({ ...form, venueType: 'улица' })}>Улица</button>
          </div>
          <div className="row">
            <button className="btn-primary" onClick={() => {
              if (!form.date) return alert('Укажите дату')
              addUpcomingDate(form)
              setForm({ date: '', startTime: '19:30', endTime: '20:30', location: DEFAULT_LOCATION, venueType: 'зал' })
              setShowAdd(false)
            }}>Сохранить</button>
            <button className="btn-ghost" onClick={() => setShowAdd(false)}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  )
}

function PriorityTab({ roster, togglePriority, setKing, updateContact }) {
  const priorityMembers = roster.filter(r => r.is_priority)
  const king = roster.find(r => r.is_king)

  return (
    <>
      <div className="card">
        <div className="section-title icon-title" style={{ marginTop: 0 }}><Crown size={15} /> Король (принимает оплату за аренду)</div>
        <div className="empty" style={{ marginBottom: 10 }}>Тот, кто собирает деньги со всех и платит за зал/доп. время.</div>
        <div className="rosterList" style={{ marginBottom: 10 }}>
          {roster.map(r => (
            <button
              key={r.name}
              className={`btn-ghost rosterBtn ${r.is_king ? 'active' : ''}`}
              onClick={() => setKing(r.is_king ? null : r.name)}
            >
              {r.is_king && <Crown size={13} className="icon-king" />} {r.name}
            </button>
          ))}
        </div>
        {king && (
          <ContactFields person={king} onChange={(field, value) => updateContact(king.name, field, value)} />
        )}
      </div>

      <div className="card">
        <div className="section-title icon-title" style={{ marginTop: 0 }}><Star size={15} /> Приоритетные игроки</div>
        <div className="empty" style={{ marginBottom: 10 }}>
          Те, кто скинулся заранее (1400₽/мес) — у них приоритет на место. Если такой человек не идёт, замена переводит ему {SUB_PRICE}₽ напрямую.
        </div>
        <div className="rosterList" style={{ marginBottom: 14 }}>
          {roster.map(r => (
            <button
              key={r.name}
              className={`btn-ghost rosterBtn ${r.is_priority ? 'active' : ''}`}
              onClick={() => togglePriority(r.name)}
            >
              {r.is_priority ? <Star size={13} className="icon-star" /> : <StarOff size={13} />} {r.name}
            </button>
          ))}
        </div>
        {priorityMembers.length > 0 && (
          <>
            <div className="section-title">Реквизиты для переводов</div>
            {priorityMembers.map(p => (
              <div key={p.name} className="contact-block">
                <div className="person-name" style={{ marginBottom: 6 }}><Star size={13} className="icon-star" /> {p.name}</div>
                <ContactFields person={p} onChange={(field, value) => updateContact(p.name, field, value)} />
              </div>
            ))}
          </>
        )}
      </div>
    </>
  )
}

function ContactFields({ person, onChange }) {
  return (
    <div className="row">
      <div style={{ flex: 1 }}>
        <label>Номер телефона</label>
        <input type="text" placeholder="+7 900 000-00-00" defaultValue={person.phone || ''} onBlur={e => onChange('phone', e.target.value)} />
      </div>
      <div style={{ flex: 1 }}>
        <label>Банк</label>
        <input type="text" placeholder="Т-Банк" defaultValue={person.bank || ''} onBlur={e => onChange('bank', e.target.value)} />
      </div>
    </div>
  )
}

function Setup({ onCreate }) {
  const [location, setLocation] = useState(DEFAULT_LOCATION)
  const [venueType, setVenueType] = useState('зал')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('19:30')
  const [endTime, setEndTime] = useState('20:30')

  return (
    <div className="card">
      <div className="section-title icon-title" style={{ marginTop: 0 }}><Plus size={15} /> Новый сбор</div>
      <label>Место</label>
      <input type="text" value={location} onChange={e => setLocation(e.target.value)} />
      <div className="row" style={{ marginBottom: 14 }}>
        <button className={`btn-ghost ${venueType === 'зал' ? 'active' : ''}`} onClick={() => setVenueType('зал')}>Зал</button>
        <button className={`btn-ghost ${venueType === 'улица' ? 'active' : ''}`} onClick={() => setVenueType('улица')}>Улица</button>
      </div>
      <label>Дата</label>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      <div className="row">
        <div style={{ flex: 1 }}><label>С</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
        <div style={{ flex: 1 }}><label>До</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
      </div>
      <div className="empty" style={{ marginBottom: 14 }}>Длительность: {formatDuration(startTime, endTime) || '—'}</div>
      <button className="btn-primary" style={{ width: '100%' }} onClick={() => {
        if (!date) return alert('Укажите дату')
        onCreate({ location: location.trim() || DEFAULT_LOCATION, venueType, date, startTime, endTime })
      }}>Создать сбор</button>
    </div>
  )
}

function Board({ state, myName, roster, vote, toggleKingPaid, addGuest, removeGuest, toggleGuestKingPaid, toggleSubSettled, toggleOpen, resetEvent, updateEventField }) {
  const [guestName, setGuestName] = useState('')
  const priorityNames = new Set(roster.filter(r => r.is_priority).map(r => r.name))
  const king = roster.find(r => r.is_king)

  const goingEntries = Object.entries(state.going || {})
  const notEntries = Object.entries(state.notGoing || {})
  const thinkEntries = Object.keys(state.thinking || {})
  const guests = state.guests || []

  const totalGoing = goingEntries.length + guests.length

  // Auto-match: priority members who are absent <-> non-priority members who are going, in order
  const absentPriority = notEntries.filter(([name]) => priorityNames.has(name))
  const nonPriorityGoing = goingEntries.filter(([name]) => !priorityNames.has(name)).map(([name]) => name)
  const matches = absentPriority.map(([name, v], i) => ({
    priorityName: name,
    substitute: nonPriorityGoing[i] || null,
    settled: v.settled
  }))

  let kingPaidCount = 0
  if (!state.isOpen) {
    goingEntries.forEach(([, v]) => { if (v.kingPaid) kingPaidCount += 1 })
    guests.forEach(g => { if (g.kingPaid) kingPaidCount += 1 })
  }

  return (
    <div className="card">
      <div className="event-name">
        <EditableText value={state.location} onSave={v => updateEventField('location', v)} />
        <span className="venue-toggle">
          <button className={`chip ${state.venueType === 'зал' ? 'chip-active' : ''}`} onClick={() => updateEventField('venueType', 'зал')}>Зал</button>
          <button className={`chip ${state.venueType === 'улица' ? 'chip-active' : ''}`} onClick={() => updateEventField('venueType', 'улица')}>Улица</button>
        </span>
      </div>
      <div className="empty icon-title" style={{ margin: '2px 0 8px' }}>
        <CalendarDays size={14} /> {state.date ? formatDateLabel(state.date) : 'дата не указана'}
      </div>

      <div className="row" style={{ marginBottom: 4 }}>
        <div style={{ flex: 1 }}><label>С</label><input type="time" value={state.startTime} onChange={e => updateEventField('startTime', e.target.value)} /></div>
        <div style={{ flex: 1 }}><label>До</label><input type="time" value={state.endTime} onChange={e => updateEventField('endTime', e.target.value)} /></div>
      </div>
      <div className="empty icon-title" style={{ margin: '-8px 0 12px' }}>
        <Clock size={13} /> {formatDuration(state.startTime, state.endTime) || '—'} · время может править кто угодно
      </div>

      <span className={`status ${state.isOpen ? 'open' : 'closed'}`}>
        {state.isOpen ? <Unlock size={12} /> : <Lock size={12} />} {state.isOpen ? 'сбор открыт' : 'сбор закрыт'}
      </span>

      {state.isOpen ? (
        <div className="row" style={{ margin: '8px 0' }}>
          <button className="btn-primary" onClick={() => vote('go')}><Check size={16} /> Иду</button>
          <button className="btn-ghost" onClick={() => vote('notgo')}><X size={16} /> Не иду</button>
          <button className="btn-ghost" onClick={() => vote('think')}><HelpCircle size={16} /> Думаю</button>
        </div>
      ) : (
        <div className="empty">Сбор закрыт — можно только отмечать оплаты</div>
      )}

      <div className="section-title">Гости — можно добавить, даже если сами не идёте</div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input type="text" placeholder="Имя гостя" value={guestName} onChange={e => setGuestName(e.target.value)} />
        <button className="btn-ghost" onClick={() => { addGuest(guestName); setGuestName('') }}><UserPlus size={16} /> Добавить</button>
      </div>

      <div className="section-title">Идут ({goingEntries.length}{guests.length ? ` + ${guests.length} гостей` : ''})</div>
      {goingEntries.length ? goingEntries.map(([name, v]) => (
        <div className="person" key={name}>
          <span className="person-name">
            <Check size={14} className="icon-go" /> {name}
            {priorityNames.has(name) && <Star size={13} className="icon-star" />}
            {!state.isOpen && v.kingPaid && <span className="paid-tag"><Banknote size={12} /> оплатил Королю</span>}
          </span>
          {!state.isOpen && (
            <button className="link" onClick={() => toggleKingPaid(name)}>{v.kingPaid ? 'Снять' : 'Оплатил Королю'}</button>
          )}
        </div>
      )) : <div className="empty">Пока никто не отметился</div>}

      {guests.map(g => (
        <div className="person guest-tag" key={g.id}>
          <span className="person-name">
            <Users size={13} /> {g.name} <span className="empty inline-empty">— гость от {g.addedBy}</span>
            {!state.isOpen && g.kingPaid && <span className="paid-tag"><Banknote size={12} /> оплатил Королю</span>}
          </span>
          <span className="pm-row">
            {!state.isOpen && <button className="link" onClick={() => toggleGuestKingPaid(g.id)}>{g.kingPaid ? 'Снять' : 'Оплатил'}</button>}
            <button className="icon-btn-ghost" onClick={() => removeGuest(g.id)}><Trash2 size={14} /></button>
          </span>
        </div>
      ))}

      <div className="section-title">Не идут ({notEntries.length})</div>
      {notEntries.length ? notEntries.map(([name]) => (
        <div className="person" key={name}>
          <span className="person-name"><X size={14} className="icon-no" /> {name} {priorityNames.has(name) && <Star size={13} className="icon-star" />}</span>
        </div>
      )) : <div className="empty">—</div>}

      <div className="section-title">Думают ({thinkEntries.length})</div>
      {thinkEntries.length ? thinkEntries.map(n => <div className="person" key={n}><HelpCircle size={14} className="icon-think" /> {n}</div>) : <div className="empty">—</div>}

      {matches.length > 0 && (
        <>
          <div className="section-title icon-title"><Repeat size={15} /> Переводы приоритетным (350₽)</div>
          {matches.map(m => (
            <div className="person guest-tag substitute-row" key={m.priorityName}>
              <span className="person-name">
                {m.substitute ? (
                  <>👉 {m.substitute} переводит {m.priorityName}</>
                ) : (
                  <>⏳ замена на место {m.priorityName} ещё не нашлась</>
                )}
              </span>
              {m.substitute && (
                <button className="link" onClick={() => toggleSubSettled(m.priorityName)}>
                  {m.settled ? '✓ переведено' : 'отметить переведённым'}
                </button>
              )}
            </div>
          ))}
          {matches.some(m => m.substitute) && (
            <PriorityContactHint roster={roster} matches={matches} priorityNames={priorityNames} />
          )}
        </>
      )}

      <div className="section-title icon-title"><Crown size={15} /> Король</div>
      {king ? (
        <div className="empty">
          {king.name}{king.phone ? ` · ${king.phone}` : ''}{king.bank ? ` · ${king.bank}` : ''}
          {!king.phone && !king.bank && ' — реквизиты не заполнены (вкладка «Приоритет»)'}
        </div>
      ) : (
        <div className="empty">Не назначен — выберите во вкладке «Приоритет»</div>
      )}

      <div className="stats">
        <div className="stat"><b>{totalGoing}</b>всего идут</div>
        {!state.isOpen && <div className="stat"><b>{kingPaidCount}</b>оплатили Королю</div>}
      </div>

      <div className="footer-actions">
        <button className="btn-ghost" onClick={toggleOpen}>
          {state.isOpen ? <Lock size={16} /> : <Unlock size={16} />} {state.isOpen ? 'Закрыть сбор' : 'Открыть сбор'}
        </button>
        <button className="link" onClick={resetEvent}><RefreshCw size={13} /> Начать новый сбор</button>
      </div>
    </div>
  )
}

function PriorityContactHint({ roster, matches, priorityNames }) {
  const relevant = matches.filter(m => m.substitute)
  return (
    <div className="empty" style={{ marginTop: -2, marginBottom: 8 }}>
      {relevant.map(m => {
        const p = roster.find(r => r.name === m.priorityName)
        if (!p || (!p.phone && !p.bank)) return null
        return <div key={m.priorityName}>{m.priorityName}: {p.phone || '—'} {p.bank ? `· ${p.bank}` : ''}</div>
      })}
    </div>
  )
}

function EditableText({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return <span className="editable-text" onClick={() => { setDraft(value); setEditing(true) }}>{value}</span>
  }
  return (
    <input
      type="text" autoFocus value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft.trim() && draft !== value) onSave(draft.trim()) }}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
      className="editable-input"
    />
  )
}
